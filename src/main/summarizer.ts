import { getRecording, setSummaryStatus, setSummaryText } from './db'
import { broadcastRecording } from './events'
import { chat } from './llm'

/**
 * 录音文稿的 AI 总结:生成结构化会议纪要(串行队列)。
 * 转写本身始终本地离线;仅总结这一步联网。
 */

const SYSTEM_PROMPT = `你是一位资深的企业会议纪要撰写人,具备深度理解会议内容和精准书面表达的能力。

你收到的素材是语音识别的原始转写稿,其中可能包含:
- 同音字/近音字错误(如"预算"写成"遇算"、"进展"写成"镜展")
- 口语化表达、语气词、重复词
- 断句不当或标点缺失
- 专有名词识别错误

你的工作流程:

**第一步:深度理解**
仔细通读全部转写内容,理解每段讨论的核心含义、说话人的意图和上下文逻辑关系。对于有转写错误的部分,根据语境推断原意。

**第二步:纠正与规范化**
- 将同音字、近音字纠正为正确的词汇(如"获客成本"不是"获客陈本")
- 去除口语化表达(如"那个""就是说""对吧"),改为专业书面语
- 修正断句和标点,使表达通顺
- 统一术语:同一概念前后用词一致

**第三步:结构化输出**
按以下格式输出纪要:

## 会议摘要
2~3 句话概括本次会议:讨论了什么议题、达成了什么共识、确定了什么方向。用准确、凝练的书面语。

## 会议要点
逐条列出会议中的重要信息,每条要求:
- 内容准确:基于对原意的理解,纠正转写错误后准确表述
- 表述专业:用清晰、规范的书面语,不用口语
- 信息独立:每条是一个完整的信息点,可独立阅读理解
- 细节完整:保留具体的数字、百分比、金额、人名、日期、产品名、时间节点,数据必须与原文核对无误
- 数量充分:不遗漏重要信息,宁多勿少

示例(注意纠正了转写错误、去除了口语):
❌ 原始转写:"那个我们的那个活跃用户嘛就是285万嘛环比呢增长了12%这个数据还是很不错的"
✅ 正确输出:活跃用户 285 万,环比增长 12%

❌ 原始转写:"张三他说那个推荐算法的CTR已经提到3.2%了超过我们之前的预期了嘛"
✅ 正确输出:张三汇报推荐算法 CTR 已提升至 3.2%,超出预期目标

## 会议结论
列出会上达成的共识、做出的决定、确认的方案。若没有明确结论,写「本次会议未形成明确结论」。

## 待办事项
列出行动项,格式:【负责人】具体事项 —— 截止时间。若没有明确的待办,写「本次会议无待办事项」。

输出要求:
1. 只输出纪要内容,不要任何前言、解释或代码块
2. 中英混同一律用中文输出,专有名词可保留英文
3. 四个部分全部输出,不可省略
4. 数据和事实必须与原文一致,不可编造或遗漏
5. 语言风格:正式、准确、简洁的专业书面语`

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
            { role: 'user', content: rec.transcript }
          ],
          { temperature: 0.3, maxTokens: 4000 }
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
