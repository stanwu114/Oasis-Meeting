import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { useRecorderStore } from '../stores/recorderStore'
import { useHarnessStore } from '../stores/harnessStore'
import { Icon } from './Icon'
import { PageTree } from './PageTree'
import logoUrl from '../assets/Oasis_Logo.svg'

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
        <img src={logoUrl} alt="Oasis" className="brand-logo" draggable={false} />
        <span className="brand-sub">NoteBook</span>
      </div>

      {/* 界面切换:Meeting ↔ Harness */}
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
          <Icon name="calendar" size={14} /> Meeting
        </button>
        <button
          type="button"
          className={`mode-btn${harnessMode ? ' on' : ''}`}
          onClick={() => useUiStore.getState().setView('harness')}
        >
          <Icon name="blocks" size={14} /> Harness
        </button>
      </div>

      {harnessMode ? (
        <>
          <div className="sidebar-actions">
            <button type="button" className="sidebar-btn primary record" onClick={() => useHarnessStore.getState().newSession()}>
              <Icon name="plus" size={15} /> 新会话
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
                title="刷新会话列表"
              >
                <Icon name="refresh" size={13} />
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
              <Icon name="plus" size={15} /> 新建 Meeting
            </button>
          </div>

          <div className="sidebar-pages">
            <div className="sidebar-pages-head">
              Meeting
              <span className="sidebar-pages-count">{pagesCount}</span>
            </div>
            <PageTree />
          </div>
        </>
      )}

      <div className="sidebar-bottom">
        {!harnessMode ? (
          <button type="button" className={btn(view === 'trash')} onClick={() => useUiStore.getState().setView('trash')}>
            <Icon name="trash" size={15} /> 回收站
          </button>
        ) : null}
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
