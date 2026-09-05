/** 从 BlockNote 文档 JSON 中提取纯文本,用于全文搜索(主进程在保存页面时调用) */

interface AnyBlock {
  type?: string
  props?: Record<string, unknown>
  content?: unknown
  children?: AnyBlock[]
}

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(inlineText).join('')
  if (content && typeof content === 'object') {
    const c = content as { text?: unknown; type?: string }
    if (typeof c.text === 'string') return c.text
    if (Array.isArray((c as AnyBlock).content)) return inlineText((c as AnyBlock).content)
  }
  return ''
}

export function extractDocText(doc: unknown): string {
  // 新格式:纯 JSON 对象 { meta: {...}, console: {...} }
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const d = doc as {
      meta?: { name?: string; topic?: string; participants?: string; location?: string; time?: string }
      console?: { notes?: string; transcript?: string; summary?: string }
    }
    const parts: string[] = []
    if (d.meta?.name) parts.push(d.meta.name)
    if (d.meta?.location) parts.push(d.meta.location)
    if (d.meta?.topic) parts.push(d.meta.topic)
    if (d.meta?.time) parts.push(d.meta.time)
    if (d.meta?.participants) parts.push(d.meta.participants)
    if (d.console?.notes) parts.push(d.console.notes)
    if (d.console?.transcript) parts.push(d.console.transcript)
    if (d.console?.summary) parts.push(d.console.summary)
    return parts.filter(Boolean).join('\n')
  }

  // 旧格式:BlockNote 文档数组
  if (!Array.isArray(doc)) return ''
  const parts: string[] = []
  const walk = (blocks: AnyBlock[]) => {
    for (const b of blocks) {
      const inline = inlineText(b.content).trim()
      if (inline) parts.push(inline)
      const caption = b.props?.caption
      if (typeof caption === 'string' && caption.trim()) parts.push(caption.trim())
      const transcript = b.props?.transcript
      if (typeof transcript === 'string' && transcript.trim()) parts.push(transcript.trim())
      if (Array.isArray(b.children)) walk(b.children)
    }
  }
  walk(doc as AnyBlock[])
  return parts.join('\n')
}

/** 从搜索命中位置生成上下文片段(取所有命中,拼接展示) */
export function makeSnippet(text: string, q: string, radius = 40): string {
  if (!text) return ''
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const positions: number[] = []
  let idx = lower.indexOf(needle)
  while (idx >= 0 && positions.length < 5) {
    positions.push(idx)
    idx = lower.indexOf(needle, idx + needle.length)
  }
  if (positions.length === 0) return text.slice(0, radius * 2).replace(/\n/g, ' ')
  const parts: string[] = []
  for (const pos of positions) {
    const start = Math.max(0, pos - radius)
    const end = Math.min(text.length, pos + q.length + radius)
    const frag = text.slice(start, end).replace(/\n/g, ' ')
    parts.push((start > 0 ? '…' : '') + frag + (end < text.length ? '…' : ''))
  }
  return parts.join(' | ')
}
