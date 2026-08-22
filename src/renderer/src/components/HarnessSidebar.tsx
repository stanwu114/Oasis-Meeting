import { useEffect } from 'react'
import { useHarnessStore } from '../stores/harnessStore'
import { Icon } from './Icon'

function formatSessionTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return time
  const sameYear = d.getFullYear() === now.getFullYear()
  return sameYear ? `${d.getMonth() + 1}/${d.getDate()} ${time}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** Harness 模式侧栏:历史会话列表 */
export function HarnessSidebar(): React.ReactNode {
  const sessions = useHarnessStore((s) => s.sessions)
  const sessionsLoading = useHarnessStore((s) => s.sessionsLoading)
  const activeSession = useHarnessStore((s) => s.activeSessionTitle)

  useEffect(() => {
    void useHarnessStore.getState().init()
  }, [])

  return (
    <>
      <div className="sidebar-actions">
        <button
          type="button"
          className="sidebar-btn primary"
          onClick={() => useHarnessStore.getState().newSession()}
        >
          <Icon name="plus" size={15} /> 新会话
        </button>
      </div>

      <div className="sidebar-pages">
        <div className="sidebar-pages-head">
          历史对话
          <span className="sidebar-pages-count">{sessions.length}</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => void useHarnessStore.getState().refreshSessions()}
            disabled={sessionsLoading}
            title="刷新"
          >
            <Icon name="refresh" size={13} />
          </button>
        </div>
        <div className="harness-sessions">
          {sessions.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`harness-session${activeSession === s.title ? ' active' : ''}`}
              title={s.title}
              onClick={() => useHarnessStore.getState().openSession(s)}
            >
              <span className="harness-session-title">{s.title}</span>
              <span className="harness-session-meta">{formatSessionTime(s.timeMs)}</span>
            </button>
          ))}
          {sessions.length === 0 && !sessionsLoading ? (
            <div className="tree-empty">还没有对话,点上方「新会话」开始</div>
          ) : null}
          {sessionsLoading ? <div className="tree-empty">加载中…</div> : null}
        </div>
      </div>
    </>
  )
}
