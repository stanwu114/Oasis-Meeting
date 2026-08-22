import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * DeepSeek LLM 薄封装:AI 总结(录音纪要/页面摘要)与编辑器划词动作共用。
 * 密钥复用 ~/.dsh/.credentials.yaml 的 DEEPSEEK_API_KEY。
 */

const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'

let cachedKey: string | null | undefined

export function hasDeepseekKey(): boolean {
  return readKey() !== null
}

export function readKey(): string | null {
  if (cachedKey !== undefined) return cachedKey
  try {
    const text = readFileSync(join(process.env.HOME ?? '', '.dsh', '.credentials.yaml'), 'utf8')
    const m = /^\s*DEEPSEEK_API_KEY:\s*["']?([\w-]+)["']?\s*$/m.exec(text)
    cachedKey = m ? m[1] : null
  } catch {
    cachedKey = null
  }
  return cachedKey
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function chat(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  const key = readKey()
  if (!key) throw new Error('未找到 DeepSeek API Key(读取 ~/.dsh/.credentials.yaml 失败)')
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 1400,
      messages
    }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`DeepSeek API ${res.status}:${body.slice(0, 160) || res.statusText}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('DeepSeek 返回为空')
  return text
}

/* ---------- 编辑器划词动作 ---------- */

export type EditorAction = 'summarize' | 'polish' | 'translate' | 'continue' | 'ask'

const ACTION_PROMPTS: Record<Exclude<EditorAction, 'ask'>, string> = {
  summarize: '用简洁的中文总结以下内容,输出 3~6 条要点,每条以「- 」开头,不要任何前后缀和标题。',
  polish: '润色以下文本:修正错别字、标点和语病,理顺语句,保持原意与语气,直接输出润色后的文本,不要解释。',
  translate: '判断以下内容语言:中文则翻译成地道英文,其他语言则翻译成中文。直接输出译文,不要解释。',
  continue: '根据以下内容自然续写一段,衔接风格与原内容一致,直接输出续写的文字,不要重复原文。'
}

export async function runEditorAction(action: EditorAction, text: string, question?: string): Promise<string> {
  if (action === 'ask') {
    return chat([
      { role: 'system', content: '你是笔记助手,基于用户给出的笔记内容回答问题。直接给出答案,简洁清晰。' },
      { role: 'user', content: `笔记内容:\n${text.slice(0, 12_000)}\n\n问题:${question ?? ''}` }
    ])
  }
  return chat([
    { role: 'system', content: ACTION_PROMPTS[action] },
    { role: 'user', content: text.slice(0, 12_000) }
  ])
}
