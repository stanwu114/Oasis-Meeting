import { app } from 'electron'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { appendAiMessage, createAiConversation, getPage, setAiConversationTitle } from './db'
import { broadcastAiChatDelta, broadcastAiChatDone, broadcastAiChatError, broadcastAiChatStatus } from './events'
import { readKey } from './llm'
import { resolveNodeBinary } from './nodeRuntime'
import { extractDocText } from '../shared/extract'
import type { SendChatInput } from '../shared/ipc'

/**
 * 智能体模式:通过官方 SDK(@deepseek-ai/dsh-sdk-client)直接驱动 vendored
 * DeepSeek Harness 运行时(JSON-RPC 子进程),获得完整智能体能力——工具调用、
 * 会话持久化、推理流。会话 id 复用我们的 conversationId,历史可延续。
 */

const MODEL = 'deepseek-v4-pro'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Harness = {
  run(prompt: string, opts?: { sessionId?: string; onNotification?: (n: any) => void }): Promise<any>
  close(): Promise<void>
}

let harness: Harness | null = null
let starting: Promise<Harness> | null = null

function vendorRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'vendor', 'deepseek-harness')
    : join(app.getAppPath(), 'vendor', 'deepseek-harness')
}

async function getHarness(): Promise<Harness> {
  if (harness) return harness
  if (starting) return starting
  starting = (async () => {
    const key = readKey()
    if (!key) throw new Error('未找到 DeepSeek API Key(读取 ~/.dsh/.credentials.yaml 失败)')
    const node = resolveNodeBinary()
    const req = createRequire(join(vendorRoot(), 'package.json'))
    const { DeepSeekHarness } = req('@deepseek-ai/dsh-sdk-client') as any
    const instance = new DeepSeekHarness({
      launch: {
        command: node.cmd,
        args: ['packages/examples/jsonrpc-demo/lib/bin.js', 'examples/jsonrpc-agent/cordis.yml'],
        cwd: vendorRoot(),
        env: { ...process.env, ...node.env, DEEPSEEK_API_KEY: key }
      },
      provider: 'deepseek-official',
      model: MODEL,
      maxTokens: 8192
    }) as Harness
    harness = instance
    return instance
  })()
  try {
    return await starting
  } finally {
    starting = null
  }
}

export async function closeAgentRuntime(): Promise<void> {
  const h = harness
  harness = null
  if (h) await h.close().catch(() => undefined)
}

function buildPrompt(input: SendChatInput): string {
  const parts: string[] = []
  if (input.contextPageId) {
    const page = getPage(input.contextPageId)
    if (page) {
      const body = page.content ? extractDocText(page.content).trim() : ''
      if (body) parts.push(`[参考:当前笔记「${page.title}」的内容]\n${body.slice(0, 12_000)}`)
    }
  }
  if (input.contextSelection?.trim()) {
    parts.push(`[参考:用户选中的文字]\n${input.contextSelection.trim().slice(0, 4_000)}`)
  }
  parts.push(input.text)
  return parts.join('\n\n')
}

export async function sendAgent(input: SendChatInput): Promise<{ conversationId: string }> {
  const conversationId = input.conversationId ?? createAiConversation('agent').id
  appendAiMessage(conversationId, 'user', input.text)
  if (!input.conversationId) {
    setAiConversationTitle(conversationId, `🤖 ${input.text.trim().slice(0, 22)}` || '智能体任务')
  }

  void (async () => {
    try {
      const h = await getHarness()
      const result = await h.run(buildPrompt(input), {
        sessionId: conversationId,
        onNotification: (n: any) => {
          const event = n?.params?.event
          if (!event) return
          if (event.type === 'assistant/chunk') {
            const chunk = event.data?.chunk
            if (chunk?.type === 'text-delta' && chunk.text) {
              broadcastAiChatDelta({ conversationId, delta: chunk.text })
            } else if (chunk?.type === 'block-start' && chunk.blockType === 'reasoning') {
              broadcastAiChatStatus({ conversationId, status: '思考中…' })
            } else if (chunk?.type === 'block-start' && chunk.blockType === 'text') {
              broadcastAiChatStatus({ conversationId, status: '' })
            }
          } else if (event.type === 'tool/start') {
            broadcastAiChatStatus({ conversationId, status: '🔧 调用工具中…' })
          } else if (event.type === 'assistant/message') {
            broadcastAiChatStatus({ conversationId, status: '' })
          }
        }
      })
      const content = String(result?.finalResponse ?? '').trim() || '(没有产出回复)'
      const message = appendAiMessage(conversationId, 'assistant', content)
      broadcastAiChatDone({ conversationId, messageId: message.id, content })
    } catch (e) {
      broadcastAiChatError({ conversationId, error: e instanceof Error ? e.message : String(e) })
    }
  })()

  return { conversationId }
}
