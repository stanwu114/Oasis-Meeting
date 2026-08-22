import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { useRecorderStore } from '../stores/recorderStore'
import { useHarnessStore } from '../stores/harnessStore'
import { PageTree } from './PageTree'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function formatSessionTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return time
  const sameYear = d.getFullYear() === now.getFullYear()
  return sameYear ? `${d.getMonth() + 1}/${d.getDate()} ${time}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function Sidebar() {
  const view = useUiStore((s) => s.view)
  const theme = useUiStore((s) => s.theme)
  const modelStatus = useUiStore((s) => s.modelStatus)
  const pagesCount = useAppStore((s) => s.pages.length)
  const recording = useRecorderStore((s) => s.phase === 'recording' || s.phase === 'saving')
  const harnessSessions = useHarnessStore((s) => s.sessions)
  const sessionsLoading = useHarnessStore((s) => s.sessionsLoading)
  const activeSession = useHarnessStore((s) => s.activeSessionTitle)
  const harnessMode = view === 'harness'

  const totalDownloaded = modelStatus?.files.reduce((acc, f) => acc + f.downloadedBytes, 0) ?? 0
  const btn = (active: boolean): string => `sidebar-btn${active ? ' active' : ''}`

  return (
    <aside className="sidebar">
      <div className="sidebar-top" />
      <div className="sidebar-brand">
        <span className="brand-mark">🏝</span>
        <span className="brand-name">Notion Oasis</span>
      </div>

      {/* 界面切换:笔记 ↔ Harness */}
      <div className="mode-switch">
        <button
          type="button"
          className={`mode-btn${!harnessMode ? ' on' : ''}`}
          onClick={() => {
            useUiStore.getState().setView('editor')
            const id = useAppStore.getState().currentId
            if (id) void useAppStore.getState().openPage(id)
          }}
        >
          🏝 笔记
        </button>
        <button
          type="button"
          className={`mode-btn${harnessMode ? ' on' : ''}`}
          onClick={() => useUiStore.getState().setView('harness')}
        >
          🧩 Harness
        </button>
      </div>

      {harnessMode ? (
        <>
          <div className="sidebar-actions">
            <button type="button" className="sidebar-btn primary record" onClick={() => useHarnessStore.getState().newSession()}>
              ✚ 新会话
            </button>
          </div>
          <div className="sidebar-pages">
            <div className="sidebar-pages-head">
              会话
              <span className="sidebar-pages-count">{harnessSessions.length}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => void useHarnessStore.getState().refreshSessions()}
                disabled={sessionsLoading}
              >
                {sessionsLoading ? '加载中…' : '↻'}
              </button>
            </div>
            <div className="harness-sessions">
              {harnessSessions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`harness-session${activeSession === s.title ? ' active' : ''}`}
                  title={`${s.title}\n工作区:${s.workspace}`}
                  onClick={() => useHarnessStore.getState().openSession(s)}
                >
                  <span className="harness-session-title">{s.title}</span>
                  <span className="harness-session-meta">
                    {formatSessionTime(s.timeMs)} · {s.workspace.split('/').pop() || s.workspace}
                  </span>
                </button>
              ))}
              {harnessSessions.length === 0 && !sessionsLoading ? (
                <div className="tree-empty">还没有 Harness 会话,点上方「新会话」开始</div>
              ) : null}
            </div>
          </div>
          <div className="sidebar-bottom">
            <button type="button" className={btn(false)} onClick={() => useUiStore.getState().setSettingsOpen(true)}>
              ⚙️ 设置
            </button>
            <button type="button" className="theme-toggle" onClick={() => useUiStore.getState().toggleTheme()}>
              {theme === 'dark' ? '☀️ 浅色' : '🌙 深色'}
            </button>
          </div>
        </>
      ) : (
        <>
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
            <button type="button" className={btn(view === 'trash')} onClick={() => useUiStore.getState().setView('trash')}>
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
        </>
      )}
    </aside>
  )
}
