import { getRecording, setSummaryStatus, setSummaryText } from './db'
import { broadcastRecording } from './events'
import { chat } from './llm'

/**
 * 录音文稿的 AI 总结:生成结构化会议纪要(串行队列)。
 * 转写本身始终本地离线;仅总结这一步联网。
 */

const SYSTEM_PROMPT = `你是专业的会议纪要助手。把用户提供的录音转写文稿总结为中文会议纪要,严格按以下 Markdown 结构输出:

## 摘要
(2~3 句话概括这段录音讲了什么)

## 要点
- (关键信息条目,保留重要的数字、人名、结论与决定)

## 待办
- (行动项;若文稿中没有明确的待办事项,省略整个「待办」小节)

要求:只输出纪要本身,不要任何前言、解释或代码块包裹;文稿可能是中英混合,一律用中文总结;若文稿极短或无实质内容,只输出「## 摘要」和一个一句话概括。`

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
        const summary = await chat(
          [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: rec.transcript.slice(0, 24_000) }
          ],
          { temperature: 0.3 }
        )
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
