import type { BlockNoteEditor } from '@blocknote/core'
import { mediaUrlFor, type RecordingInfo } from '../../../shared/ipc'

/**
 * 编辑器实例桥:录音/导入流程完成后,把录音块插入当前编辑器。
 * 编辑器按页面 remount,这里始终指向最新实例。
 */
type AnyEditor = BlockNoteEditor<any, any, any>

let currentEditor: AnyEditor | null = null

export function setEditor(editor: AnyEditor | null): void {
  currentEditor = editor
}

export function getEditor(): AnyEditor | null {
  return currentEditor
}

interface RecordingBlockProps {
  recordingId: string
  url: string
  mimeType: string
  durationMs: number
  transcript: string
  language: string
}

/** 在当前光标块之后插入录音块;成功返回块 id */
export function insertRecordingBlock(rec: RecordingInfo): string | null {
  const editor = currentEditor
  if (!editor) return null
  try {
    const target = editor.getTextCursorPosition().block
    const props: RecordingBlockProps = {
      recordingId: rec.id,
      url: mediaUrlFor(rec.fileName),
      mimeType: rec.mimeType,
      durationMs: rec.durationMs,
      transcript: rec.transcript ?? '',
      language: rec.language
    }
    const inserted = editor.insertBlocks([{ type: 'recording', props } as never], target, 'after')
    const block = inserted[0]
    if (block) {
      void window.oasis.recordings.updateBlock(rec.id, block.id as string)
      try {
        editor.setTextCursorPosition(block.id as never, 'end')
      } catch {
        /* 某些版本需要 block 对象而非 id,忽略失败 */
      }
      return block.id as string
    }
    return null
  } catch (e) {
    console.error('[bridge] 插入录音块失败:', e)
    return null
  }
}

/** 把转写文稿作为段落块插入录音块之后 */
export function insertTranscriptAsParagraphs(recordingBlockId: string, transcript: string): void {
  const editor = currentEditor
  if (!editor) return
  const block = editor.getBlock(recordingBlockId)
  if (!block) return
  const paragraphs = transcript
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return
  editor.insertBlocks(
    paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text, styles: {} }] as never
    })) as never,
    block,
    'after'
  )
}

/**
 * 「确认总结并转为正文」:AI 总结(## 标题 / - 条目 / 段落)+ 分隔线 + 完整转写文稿,
 * 依次插入录音块之后,形成一篇完整会议纪要。
 */
export function insertMeetingNotesAsBody(recordingBlockId: string, summary: string, transcript: string): void {
  const editor = currentEditor
  if (!editor) return
  const anchor = editor.getBlock(recordingBlockId)
  if (!anchor) return

  const text = (s: string): never => [{ type: 'text', text: s, styles: {} }] as never
  const blocks: Record<string, unknown>[] = []

  for (const raw of summary.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', props: { level: 3 }, content: text(line.slice(3)) })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'heading', props: { level: 2 }, content: text(line.slice(2)) })
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push({ type: 'bulletListItem', content: text(line.replace(/^[-*]\s+/, '')) })
    } else {
      blocks.push({ type: 'paragraph', content: text(line) })
    }
  }

  const transcriptParagraphs = transcript
    .split(/\n{2,}/)
    .map((t) => t.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, '').trim())
    .filter(Boolean)
  if (transcriptParagraphs.length > 0) {
    blocks.push({ type: 'divider' as string })
    blocks.push({ type: 'heading', props: { level: 3 }, content: text('转写文稿') })
    for (const p of transcriptParagraphs) blocks.push({ type: 'paragraph', content: text(p) })
  }

  if (blocks.length === 0) return
  editor.insertBlocks(blocks as never, anchor, 'after')
}
