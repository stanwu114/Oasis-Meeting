import { useEffect, useRef } from 'react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { zh } from '@blocknote/core/locales'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { RecordingBlock } from './recordingBlock'
import { setEditor } from './bridge'
import { useAppStore } from '../stores/appStore'
import { useRecordingsStore } from '../stores/recordingsStore'
import { useUiStore } from '../stores/uiStore'

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    recording: RecordingBlock()
  }
})

export default function OasisEditor({ pageId }: { pageId: string }) {
  const title = useAppStore((s) => s.currentTitle)
  const initialContent = useAppStore.getState().currentContent
  const theme = useUiStore((s) => s.theme)

  const editor = useCreateBlockNote({
    schema,
    dictionary: zh as never,
    initialContent: initialContent && initialContent.length > 0 ? (initialContent as never) : undefined
  })

  /* 注册编辑器桥 + 载入本页录音状态 */
  useEffect(() => {
    setEditor(editor)
    void useRecordingsStore.getState().hydratePage(pageId)
    return () => setEditor(null)
  }, [editor, pageId])

  /* 内容防抖保存 */
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        void window.oasis.pages.updateContent(pageId, editor.document as never)
      }, 600)
    })
    return () => {
      unsubscribe()
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [editor, pageId])

  /* 转写完成 → 同步 transcript 到块属性(保证文档自包含、导出可见) */
  useEffect(() => {
    const syncBlock = (recordingId: string, transcript: string): void => {
      const block = editor.document.find(
        (b) => (b.props as Record<string, unknown>).recordingId === recordingId
      )
      if (!block) return
      const current = String((block.props as Record<string, unknown>).transcript ?? '')
      if (current !== transcript) {
        editor.updateBlock(block as never, { props: { transcript } } as never)
      }
    }
    return useRecordingsStore.subscribe((state, prev) => {
      // zustand v5 subscribe 回调只有 (state, prevState)
      for (const id of Object.keys(state.byId)) {
        const rec = state.byId[id]
        const prevRec = prev.byId[id]
        if (rec && rec.transcript !== undefined && rec.transcript !== prevRec?.transcript) {
          syncBlock(id, rec.transcript ?? '')
        }
      }
    })
  }, [editor])

  /* 标题防抖改名 */
  const titleTimer = useRef<number | null>(null)
  const onTitleInput = (value: string): void => {
    useAppStore.getState().setCurrentTitleLocal(value)
    if (titleTimer.current) window.clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => {
      void useAppStore.getState().renamePage(pageId, value.trim() || '无标题')
    }, 500)
  }

  return (
    <div className="editor-page">
      <textarea
        className="page-title"
        value={title}
        placeholder="无标题"
        rows={1}
        onChange={(e) => onTitleInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            editor.focus()
          }
        }}
      />
      <BlockNoteView editor={editor} theme={theme === 'dark' ? 'dark' : 'light'} />
    </div>
  )
}
