import { getLlmConfig } from './llmSettings'

/**
 * LLM 直连薄封装(AgentScope 运行时的降级路径):AI 纪要、会议命名与编辑器动作共用。
 * 接口配置(密钥/地址/模型)由设置面板管理,存应用自身数据库。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function chat(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number; timeoutMs?: number }): Promise<string> {
  const cfg = getLlmConfig()
  if (!cfg.apiKey) throw new Error('未配置 API Key,请到「设置 → AI 大模型接口」填写')
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 1400,
      messages
    }),
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 120_000)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`大模型接口 ${res.status}:${body.slice(0, 160) || res.statusText}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('大模型接口返回为空')
  return text
}

/* ---------- 编辑器划词动作 ---------- */

export type EditorAction = 'summarize' | 'polish' | 'proofread' | 'explain' | 'translate' | 'continue' | 'ask'

const ACTION_PROMPTS: Record<Exclude<EditorAction, 'ask'>, string> = {
  summarize: '用简洁的中文总结以下内容,输出 3~6 条要点,每条以「- 」开头,不要任何前后缀和标题。',
  polish: '润色改写以下文本:优化表达与结构、修正错别字标点和语病,保持原意与语气,直接输出改写后的文本,不要解释。',
  proofread: '校对以下文本:只修正错别字、标点和明显语病,尽量保持原文措辞不变,直接输出校对后的文本,不要解释。',
  explain: '解释以下内容:它讲了什么、为什么重要、有什么注意点。用简洁的中文分点说明。',
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

export async function meetingName(transcript: string): Promise<{ name: string; topic: string }> {
  const raw = await chat(
    [
      {
        role: 'system',
        content:
          '根据会议录音转写文稿,输出一个 JSON 对象(不要代码块包裹):{"name":"会议名称","topic":"会议主题"}。name 不超过 10 个字、不要引号书名号、不要以「会议」结尾;topic 是一句话概括本次会议主题(15~30 字)。只输出 JSON。'
      },
      { role: 'user', content: transcript.slice(0, 6_000) }
    ],
    { temperature: 0.4, maxTokens: 200 }
  )
  let name = ''
  let topic = ''
  try {
    const m = /\{[\s\S]*\}/.exec(raw)
    if (m) {
      const obj = JSON.parse(m[0]) as { name?: string; topic?: string }
      name = obj.name ?? ''
      topic = obj.topic ?? ''
    }
  } catch {
    /* 兜底:第一行作名称 */
  }
  if (!name) name = raw.split('\n')[0] ?? ''
  name = name.replace(/["「」《》\s]/g, '').slice(0, 10)
  topic = topic.replace(/^["「]|["」]$/g, '').slice(0, 40)
  return { name, topic }
}

