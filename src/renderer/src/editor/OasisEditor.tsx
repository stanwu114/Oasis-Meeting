import { useEffect, useRef, useState } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from '@blocknote/core'
import { zh } from '@blocknote/core/locales'
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { RecordingBlock } from './recordingBlock'
import { MeetingMetaBlock } from './meetingMetaBlock'
import { setEditor, insertSummaryAtDocStart } from './bridge'
import { useAppStore } from '../stores/appStore'
import { useRecordingsStore } from '../stores/recordingsStore'
import { useUiStore } from '../stores/uiStore'
import { beijingStamp } from '../../../shared/ipc'
import { useRecorderStore } from '../stores/recorderStore'
import { Icon } from '../components/Icon'
import { importAudioAndTranscribe } from '../audio/pipeline'

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    recording: RecordingBlock(),
    meetingMeta: MeetingMetaBlock()
  }
})

export default function OasisEditor({ pageId }: { pageId: string }) {
  const title = useAppStore((s) => s.currentTitle)
  const initialContent = useAppStore.getState().currentContent
  const theme = useUiStore((s) => s.theme)
  const recorderBusy = useRecorderStore((s) => s.phase !== 'idle')
  const [docEmpty, setDocEmpty] = useState(!(initialContent && initialContent.length > 0))
  const [summarizing, setSummarizing] = useState(false)

  const editor = useCreateBlockNote({
    schema,
    dictionary: { ...(zh as unknown as Record<string, unknown>), placeholders: { default: '', heading: '', toggleListItem: '', bulletListItem: '', numberedListItem: '', checkListItem: '' } } as never,
    initialContent: initialContent && initialContent.length > 0 ? (initialContent as never) : undefined
  })

  const isDocEmpty = (): boolean => {
    const doc = editor.document as Array<{ type: string; content?: unknown; children?: unknown[] }>
    if (doc.length === 0) return true
    if (doc.length > 1) return false
    const only = doc[0]
    const hasText = Array.isArray(only.content) && only.content.length > 0
    return only.type === 'paragraph' && !hasText && !(only.children && only.children.length > 0)
  }

  /* / 菜单:默认项 + 录音转写 + 导入音频 */
  const getSlashItems = async (query: string) =>
    filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), recordSlashItem, importSlashItem], query)

  /* 注册编辑器桥 + 载入本页录音状态 */
  useEffect(() => {
    setEditor(editor)
    void useRecordingsStore.getState().hydratePage(pageId)
    return () => setEditor(null)
  }, [editor, pageId])

  /* 内容防抖保存 + 空文档检测 */
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      setDocEmpty(isDocEmpty())
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

  /* 会议信息卡:地点为空时自动 IP 定位(仅补空,不覆盖用户输入) */
  useEffect(() => {
    const meta = editor.document.find((b) => b.type === 'meetingMeta')
    if (!meta) return
    if ((meta.props as Record<string, string>).location) return
    let cancelled = false
    void window.oasis.system.getCityLocation().then((loc) => {
      if (cancelled || !loc) return
      const fresh = editor.document.find((b) => b.type === 'meetingMeta')
      if (!fresh || (fresh.props as Record<string, string>).location) return
      const place = [loc.country, loc.region, loc.city]
        .filter((x, i, arr) => x && arr.indexOf(x) === i)
        .join(' ')
      try {
        editor.updateBlock(fresh as never, { props: { location: place } } as never)
      } catch {
        /* noop */
      }
    })
    return () => {
      cancelled = true
    }
  }, [editor, pageId])

  /* 录音转写完成 → AI 自动命名会议并更新标题(名称为空时,每页仅一次) */
  const namedRef = useRef(false)
  useEffect(() => {
    return useRecordingsStore.subscribe((state, prev) => {
      if (namedRef.current) return
      const meta = editor.document.find((b) => b.type === 'meetingMeta') as
        | { id: string; props: Record<string, string> }
        | undefined
      if (!meta || meta.props.name?.trim()) return
      for (const rec of Object.values(state.byId)) {
        if (rec.pageId !== pageId || !rec.transcript) continue
        if (prev.byId[rec.id]?.transcript === rec.transcript) continue
        namedRef.current = true
        void window.oasis.ai
          .meetingName(rec.transcript)
          .then(({ name, topic }) => {
            if (!name) return
            try {
              editor.updateBlock(meta.id as never, { props: { name, topic: topic || meta.props.topic } } as never)
            } catch {
              /* noop */
            }
            const timePart = meta.props.time || beijingStamp()
            void useAppStore.getState().renamePage(pageId, `${name}会议@${timePart}`)
          })
          .catch(() => {
            namedRef.current = false
          })
        break
      }
    })
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

  /* 标题防抖改名:输入过程允许为空,失焦时才兜底为「无标题」 */
  const titleTimer = useRef<number | null>(null)
  const onTitleInput = (value: string): void => {
    useAppStore.getState().setCurrentTitleLocal(value)
    if (titleTimer.current) window.clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => {
      void useAppStore.getState().renamePage(pageId, value.trim())
    }, 500)
  }
  const onTitleBlur = (): void => {
    if (titleTimer.current) window.clearTimeout(titleTimer.current)
    if (!useAppStore.getState().currentTitle.trim()) {
      useAppStore.getState().setCurrentTitleLocal('无标题')
      void useAppStore.getState().renamePage(pageId, '无标题')
    }
  }

  const summarizePage = async (): Promise<void> => {
    if (summarizing) return
    setSummarizing(true)
    try {
      const summary = await window.oasis.ai.summarizePage(pageId)
      if (insertSummaryAtDocStart(summary)) useUiStore.getState().showToast('已在本页顶部插入 AI 摘要')
    } catch (e) {
      useUiStore.getState().showToast(`总结失败:${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="editor-page">
      <div className="page-actions">
        <button
          type="button"
          className="page-ai-btn"
          disabled={summarizing || docEmpty}
          title="对本页内容生成 AI 摘要,插入到页首"
          onClick={() => void summarizePage()}
        >
          {summarizing ? <span className="spin" /> : <Icon name="zap" size={13} />} 总结本页
        </button>
      </div>
      <textarea
        className="page-title"
        value={title}
        placeholder="无标题"
        rows={1}
        onChange={(e) => onTitleInput(e.target.value)}
        onBlur={onTitleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            editor.focus()
          }
        }}
      />
      {docEmpty ? (
        <div className="empty-doc-hints">
          <button type="button" className="hint-chip record" disabled={recorderBusy} onClick={() => void useRecorderStore.getState().start()}>
            <Icon name="mic" size={15} /> 开始录音转写
          </button>
          <button type="button" className="hint-chip" disabled={recorderBusy} onClick={() => void importAudioAndTranscribe()}>
            <Icon name="upload" size={15} /> 导入音频转写
          </button>
          <span className="hint-text">输入 / 查看全部块类型</span>
        </div>
      ) : null}
      <BlockNoteView
          editor={editor}
          theme={theme === 'dark' ? 'dark' : 'light'}
          slashMenu={false}
          formattingToolbar={false}
          sideMenu={false}
        >
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems} />
      </BlockNoteView>
      {!recorderBusy ? (
        <button
          type="button"
          className="record-fab"
          title="在当前笔记中录音转写"
          onClick={() => void useRecorderStore.getState().start()}
        >
          <Icon name="mic" size={21} />
        </button>
      ) : null}
    </div>
  )
}

const recordSlashItem = {
  title: '录音转写',
  subtext: '录制一段音频,停止后本地转写',
  aliases: ['录音', '转写', 'record', 'audio', 'meeting', '会议'],
  group: 'Media' as const,
  icon: <Icon name="mic" size={16} />,
  onItemClick: () => void useRecorderStore.getState().start()
}

const importSlashItem = {
  title: '导入音频转写',
  subtext: '选择本地音频文件,本地转写',
  aliases: ['导入', '音频', 'import', 'mp3', 'wav'],
  group: 'Media' as const,
  icon: <Icon name="upload" size={16} />,
  onItemClick: () => void importAudioAndTranscribe()
}
