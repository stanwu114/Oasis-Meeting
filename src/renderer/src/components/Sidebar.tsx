import { useRef, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { Icon } from './Icon'
import { PageTree } from './PageTree'
import { HarnessSidebar } from './HarnessSidebar'

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

      {/* 界面切换:Meeting ↔ Harness */}
      <div className="mode-switch">
        <button
          type="button"
          className={`mode-btn${(view as string) !== 'harness' ? ' on' : ''}`}
          onClick={() => {
            useUiStore.getState().setView('editor')
            const id = useAppStore.getState().currentId
            if (id) void useAppStore.getState().openPage(id)
          }}
        >
          <Icon name="calendar" size={14} /> Meeting
        </button>
        <button
          type="button"
          className={`mode-btn${view === 'harness' ? ' on' : ''}`}
          onClick={() => useUiStore.getState().setView('harness')}
        >
          <Icon name="blocks" size={14} /> Harness
        </button>
      </div>

      {(view as string) !== 'harness' ? (
        <>
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
      {(view as string) !== 'harness' ? (
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
      ) : null}

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
        </>
      ) : (
        <HarnessSidebar />
      )}

      <div className="sidebar-bottom">
        <button type="button" className={btn(view === 'trash')} onClick={() => useUiStore.getState().setView('trash')}>
          <Icon name="trash" size={15} /> 回收站
        </button>
        <button type="button" className={btn(false)} onClick={() => useUiStore.getState().setSettingsOpen(true)}>
          <Icon name="settings" size={15} /> 设置
        </button>
        {modelStatus && !modelStatus.downloaded ? (
          <button
            type="button"
            className="model-hint"
            onClick={() => useUiStore.getState().setSettingsOpen(true)}
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
