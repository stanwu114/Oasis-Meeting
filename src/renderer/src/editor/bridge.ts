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
