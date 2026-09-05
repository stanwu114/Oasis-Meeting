import { useRef, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { Icon } from './Icon'
import { PageTree } from './PageTree'
import { useRecordingStore } from '../stores/recordingStore'
import { formatDuration } from '../audio/pcm'

const REC_PHASE_LABEL: Record<string, string> = {
  recording: '录音中',
  paused: '已暂停',
  importing: '导入中',
  transcribing: '转写中',
  summarizing: '生成纪要'
}

function GlobalRecordingIndicator(): React.ReactNode | null {
  const phase = useRecordingStore((s) => s.phase)
  const pageId = useRecordingStore((s) => s.pageId)
  const pageTitle = useRecordingStore((s) => s.pageTitle)
  const elapsedMs = useRecordingStore((s) => s.elapsedMs)
  if (!phase || !pageId || !REC_PHASE_LABEL[phase]) return null
  const live = phase === 'recording' || phase === 'paused'
  return (
    <div className={`rec-indicator${live ? ' live' : ''}`}>
      <button
        type="button"
        className="rec-indicator-main"
        title="点击回到该会议"
        onClick={() => {
          void useAppStore.getState().openPage(pageId)
          useUiStore.getState().setView('editor')
        }}
      >
        <span className="rec-dot" />
        <span className="rec-indicator-text">
          {REC_PHASE_LABEL[phase]}
          {live ? ` ${formatDuration(elapsedMs)}` : ''}
          <em>{pageTitle}</em>
        </span>
      </button>
      {live ? (
        <button
          type="button"
          className="rec-indicator-stop"
          title="停止录音"
          onClick={() => void useRecordingStore.getState().stop()}
        >
          <Icon name="stop" size={11} />
        </button>
      ) : null}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function Sidebar() {
  const view = useUiStore((s) => s.view)
  const theme = useUiStore((s) => s.theme)
  const modelStatus = useUiStore((s) => s.modelStatus)
  const pagesCount = useAppStore((s) => s.pages.length)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const composingRef = useRef(false)
  const searchTimerRef = useRef<number | null>(null)

  const onSearchInput = (value: string): void => {
    setSearchInput(value)
    // IME 组词中不触发搜索
    if (composingRef.current) return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = window.setTimeout(() => {
      if (value.trim().length < 2) {
        useUiStore.getState().setSearch('', [])
        return
      }
      void window.oasis.search.query(value.trim()).then((results) => {
        useUiStore.getState().setSearch(value, results)
      })
    }, 300)
  }

  const totalDownloaded = modelStatus?.files.reduce((acc, f) => acc + f.downloadedBytes, 0) ?? 0
  const btn = (active: boolean): string => `sidebar-btn${active ? ' active' : ''}`

  const createProject = async (): Promise<void> => {
    setCtxMenu(null)
    const id = await useAppStore.getState().createPage(null, '新建 Project', { select: true })
    void useAppStore.getState().setIcon(id, 'project')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top" />
      <div className="sidebar-brand">
        <span className="brand-word">Oasis</span>
        <span className="brand-sub">Meeting</span>
      </div>


          <div className="sidebar-actions">
            <button
              type="button"
              className="sidebar-btn primary"
                        onClick={() => void useAppStore.getState().createPage(null)}
            >
              新建 Meeting
            </button>
          </div>

          {/* 搜索框 */}
          <div className="sidebar-search">
          <Icon name="search" size={14} />
          <input
            className="sidebar-search-input"
            type="text"
            placeholder="搜索会议内容…"
            value={searchInput}
            onChange={(e) => onSearchInput(e.target.value)}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={(e) => {
              composingRef.current = false
              onSearchInput((e.target as HTMLInputElement).value)
            }}
          />
          {searchInput ? (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => { setSearchInput(''); useUiStore.getState().setSearch('', []); }}
            >
              <Icon name="close" size={12} />
            </button>
          ) : null}
          </div>

          <div
            className="sidebar-pages"
            onContextMenu={(e) => {
              // 空白区域右键
              if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('page-tree') || (e.target as HTMLElement).classList.contains('tree-empty')) {
                e.preventDefault()
                setCtxMenu({ x: e.clientX, y: e.clientY })
              }
            }}
          >
            <div className="sidebar-pages-head">
              Meeting
              <span className="sidebar-pages-count">{pagesCount}</span>
            </div>
            <PageTree />
            {ctxMenu ? (
              <>
                <div className="ctx-overlay" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
                <div className="ctx-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
                  <button type="button" onClick={createProject}>
                    <Icon name="folder" size={14} /> 新建 Project
                  </button>
                </div>
              </>
            ) : null}
          </div>

      <div className="sidebar-bottom">
        {/* 全局录音指示器:录音/处理期间可见,点击跳回对应会议 */}
        <GlobalRecordingIndicator />
        <button type="button" className={btn(view === 'trash')} onClick={() => useUiStore.getState().setView('trash')}>
          <Icon name="trash" size={15} /> 回收站
        </button>
        <button type="button" className={btn(view === 'settings')} onClick={() => useUiStore.getState().setView('settings')}>
          <Icon name="settings" size={15} /> 设置
        </button>
        {modelStatus && !modelStatus.downloaded ? (
          <button
            type="button"
            className="model-hint"
            onClick={() => useUiStore.getState().setView('settings')}
            title="转写引擎模型未下载,点击前往设置"
          >
            <Icon name="download" size={13} />
            {modelStatus.downloading ? `模型下载中 ${formatBytes(totalDownloaded)}` : '下载转写模型(约 240MB)'}
          </button>
        ) : null}
        <button type="button" className="theme-toggle" onClick={() => useUiStore.getState().toggleTheme()}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
      </div>
    </aside>
  )
}
