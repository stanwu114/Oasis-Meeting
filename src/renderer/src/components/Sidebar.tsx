import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { useRecorderStore } from '../stores/recorderStore'
import { PageTree } from './PageTree'

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
  const recording = useRecorderStore((s) => s.phase === 'recording' || s.phase === 'saving')

  const totalDownloaded = modelStatus?.files.reduce((acc, f) => acc + f.downloadedBytes, 0) ?? 0

  const btn = (active: boolean): string => `sidebar-btn${active ? ' active' : ''}`

  return (
    <aside className="sidebar">
      <div className="sidebar-top" />
      <div className="sidebar-brand">
        <span className="brand-mark">🏝</span>
        <span className="brand-name">Notion Oasis</span>
      </div>

      <div className="sidebar-actions">
        <button
          type="button"
          className="sidebar-btn primary"
          disabled={recording}
          onClick={() => void useAppStore.getState().createPage(null)}
        >
          ＋ 新建笔记
        </button>
      </div>

      <div className="sidebar-sections">
        <button
          type="button"
          className={btn(view === 'editor')}
          onClick={() => {
            useUiStore.getState().setView('editor')
            const id = useAppStore.getState().currentId
            if (id) void useAppStore.getState().openPage(id)
          }}
        >
          📝 笔记
        </button>
        <button
          type="button"
          className={btn(view === 'recordings')}
          onClick={() => useUiStore.getState().setView('recordings')}
        >
          🎧 录音
        </button>
        <button type="button" className={btn(view === 'ai')} onClick={() => useUiStore.getState().setView('ai')}>
          🤖 AI
        </button>
        <button type="button" className={btn(false)} onClick={() => useUiStore.getState().setSearchOpen(true)}>
          🔍 搜索 <kbd>⌘K</kbd>
        </button>
      </div>

      <div className="sidebar-pages">
        <div className="sidebar-pages-head">
          页面
          <span className="sidebar-pages-count">{pagesCount}</span>
        </div>
        <PageTree />
      </div>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={btn(view === 'trash')}
          onClick={() => useUiStore.getState().setView('trash')}
        >
          🗑 回收站
        </button>
        <button type="button" className={btn(false)} onClick={() => useUiStore.getState().setSettingsOpen(true)}>
          ⚙️ 设置
        </button>
        {modelStatus && !modelStatus.downloaded ? (
          <button
            type="button"
            className="model-hint"
            onClick={() => useUiStore.getState().setSettingsOpen(true)}
            title="转写引擎模型未下载,点击前往设置"
          >
            {modelStatus.downloading ? `模型下载中 ${formatBytes(totalDownloaded)}` : '⬇ 下载转写模型(约 240MB)'}
          </button>
        ) : null}
        <button type="button" className="theme-toggle" onClick={() => useUiStore.getState().toggleTheme()}>
          {theme === 'dark' ? '☀️ 浅色' : '🌙 深色'}
        </button>
      </div>
    </aside>
  )
}
