import { getRecording, setSummaryStatus, setSummaryText } from './db'
import { broadcastRecording } from './events'
import { chat } from './llm'

/**
 * 录音文稿的 AI 总结:生成结构化会议纪要(串行队列)。
 * 转写本身始终本地离线;仅总结这一步联网。
 */

const SYSTEM_PROMPT = `你是专业的会议纪要助手。基于录音转写文稿(可能附带用户的手动笔记)生成结构化会议纪要。

严格按以下四个部分输出:

## 会议摘要
(2~3 句话概括本次会议的核心内容:讨论了什么、达成了什么、接下来的方向)

## 会议要点
- (关键信息条目,保留重要的数字、人名、结论与决定;每条一句话,简洁明确)

## 会议结论
- (会上达成的共识、做出的决定、统一的意见;若没有明确结论,写「本次会议未形成明确结论」)

## 待办事项
- (行动项,格式:【负责人】事项 —— 截止时间;若文稿中没有明确的待办,写「本次会议无待办事项」)

要求:
1. 只输出纪要本身,不要前言、解释或代码块包裹
2. 素材来源为录音转写稿和会议笔记,综合两者提炼
3. 中英混同一律用中文输出
4. 每个部分都必须输出,不可省略
5. 若内容极短或无实质信息,各部分写一句话概括即可`

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
