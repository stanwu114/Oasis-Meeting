import { randomUUID } from 'node:crypto'
import {
  appendAiMessage,
  createAiConversation,
  getPage,
  listAiMessages,
  setAiConversationTitle
} from './db'
import { broadcastAiChatDelta, broadcastAiChatDone, broadcastAiChatError } from './events'
import { readKey } from './llm'
import { extractDocText } from '../shared/extract'
import type { SendChatInput } from '../shared/ipc'

/**
 * 原生 AI 对话:DeepSeek 流式补全 + 笔记上下文注入。
 * 回复以事件流(delta → done/error)广播到渲染进程。
 */

const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'
const HISTORY_LIMIT = 20

let activeAbort: AbortController | null = null

const BASE_SYSTEM = `你是 Notion Oasis 笔记应用的内置 AI 助手。回答简洁、直接、有条理;默认使用中文。
当提供了笔记上下文时,优先基于上下文回答;上下文之外的问题正常回答并说明依据不足。`

function buildMessages(input: SendChatInput): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const parts: string[] = [BASE_SYSTEM]

  if (input.contextPageId) {
    const page = getPage(input.contextPageId)
    if (page) {
      const body = page.content ? extractDocText(page.content).trim() : ''
      if (body) {
        parts.push(`当前笔记标题:${page.title}\n当前笔记内容:\n${body.slice(0, 12_000)}`)
      }
    }
  }
  if (input.contextSelection?.trim()) {
    parts.push(`用户当前选中的文字:\n${input.contextSelection.trim().slice(0, 4_000)}`)
  }

  const history = input.conversationId
    ? listAiMessages(input.conversationId).filter((m) => m.role === 'user' || m.role === 'assistant').slice(-HISTORY_LIMIT)
    : []

  return [
    { role: 'system', content: parts.join('\n\n---\n\n') },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: input.text }
  ]
}

export async function sendChat(input: SendChatInput): Promise<{ conversationId: string }> {
  const key = readKey()
  if (!key) throw new Error('未找到 DeepSeek API Key(读取 ~/.dsh/.credentials.yaml 失败)')

  const conversationId = input.conversationId ?? createAiConversation().id
  appendAiMessage(conversationId, 'user', input.text)
  if (!input.conversationId) {
    setAiConversationTitle(conversationId, input.text.trim().slice(0, 24) || '新对话')
  }

  const abort = new AbortController()
  activeAbort = abort

  void (async () => {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.5,
          max_tokens: 2048,
          stream: true,
          messages: buildMessages({ ...input, conversationId })
        }),
        signal: abort.signal
      })
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '')
        throw new Error(`DeepSeek API ${res.status}:${body.slice(0, 160) || res.statusText}`)
      }

      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[]
            }
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              full += delta
              broadcastAiChatDelta({ conversationId, delta })
            }
          } catch {
            /* 忽略不完整行 */
          }
        }
      }

      const message = appendAiMessage(conversationId, 'assistant', full || '(空回复)')
      broadcastAiChatDone({ conversationId, messageId: message.id, content: message.content })
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError'
      if (aborted) {
        broadcastAiChatDone({ conversationId, messageId: randomUUID(), content: '(已停止)' })
      } else {
        broadcastAiChatError({ conversationId, error: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      if (activeAbort === abort) activeAbort = null
    }
  })()

  return { conversationId }
}

export function stopChat(): void {
  activeAbort?.abort()
  activeAbort = null
}
