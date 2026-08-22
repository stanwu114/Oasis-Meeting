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

/** 从搜索命中位置生成上下文片段 */
export function makeSnippet(text: string, q: string, radius = 40): string {
  if (!text) return ''
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text.slice(0, radius * 2)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\n/g, ' ') + (end < text.length ? '…' : '')
}
