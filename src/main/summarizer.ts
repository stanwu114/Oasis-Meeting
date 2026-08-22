import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getRecording, setSummaryStatus, setSummaryText } from './db'
import { broadcastRecording } from './events'

/**
 * 录音文稿的 AI 总结:调用 DeepSeek chat API 生成结构化会议纪要。
 * API Key 复用 dsh 的凭据(~/.dsh/.credentials.yaml 的 DEEPSEEK_API_KEY)。
 * 转写本身始终本地离线;仅总结这一步联网。
 */

const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'

const SYSTEM_PROMPT = `你是专业的会议纪要助手。把用户提供的录音转写文稿总结为中文会议纪要,严格按以下 Markdown 结构输出:

## 摘要
(2~3 句话概括这段录音讲了什么)

## 要点
- (关键信息条目,保留重要的数字、人名、结论与决定)

## 待办
- (行动项;若文稿中没有明确的待办事项,省略整个「待办」小节)

要求:只输出纪要本身,不要任何前言、解释或代码块包裹;文稿可能是中英混合,一律用中文总结;若文稿极短或无实质内容,只输出「## 摘要」和一个一句话概括。`

let cachedKey: string | null | undefined

export function hasDeepseekKey(): boolean {
  return readKey() !== null
}

function readKey(): string | null {
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

async function callDeepseek(transcript: string): Promise<string> {
  const key = readKey()
  if (!key) {
    throw new Error('未找到 DeepSeek API Key(读取 ~/.dsh/.credentials.yaml 的 DEEPSEEK_API_KEY 失败)')
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript.slice(0, 24_000) }
      ]
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

/* ---------- 串行队列 ---------- */

const queue: string[] = []
let running = false

async function processQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const id = queue.shift()!
      const rec = getRecording(id)
      if (!rec?.transcript) continue
      setSummaryStatus(id, 'summarizing')
      broadcastRecording(getRecording(id)!)
      try {
        const summary = await callDeepseek(rec.transcript)
        setSummaryText(id, summary)
      } catch (e) {
        setSummaryStatus(id, 'error', e instanceof Error ? e.message : String(e))
      }
      const updated = getRecording(id)
      if (updated) broadcastRecording(updated)
    }
  } finally {
    running = false
  }
}

/** 加入总结队列(重复入队自动去重) */
export function enqueueSummary(recordingId: string): void {
  if (queue.includes(recordingId)) return
  queue.push(recordingId)
  void processQueue()
}
