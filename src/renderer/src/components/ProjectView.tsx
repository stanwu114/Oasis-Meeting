import { useEffect, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { Icon } from './Icon'
import type { PageSummary } from '../../../shared/ipc'

/** Project 详情页:显示 Project 名称 + 文件夹下的 Meeting 列表 */
export function ProjectView({ pageId }: { pageId: string }) {
  const title = useAppStore((s) => s.currentTitle)
  const pages = useAppStore((s) => s.pages)
  const [meetings, setMeetings] = useState<PageSummary[]>([])

  useEffect(() => {
    setMeetings(pages.filter((p) => p.parentId === pageId && p.deletedAt === undefined))
  }, [pages, pageId])

  const openMeeting = (id: string): void => {
    void useAppStore.getState().openPage(id)
  }

  const createMeeting = (): void => {
    void useAppStore.getState().createPage(pageId)
  }

  return (
    <div className="project-view">
      <div className="project-head">
        <div className="project-icon">
          <Icon name="folder" size={28} />
        </div>
        <h1 className="project-title">{title}</h1>
        <span className="project-count">{meetings.length} 个 Meeting</span>
      </div>

      <div className="project-actions">
        <button type="button" className="btn primary" onClick={createMeeting}>
          新建 Meeting
        </button>
      </div>

      <div className="project-meetings">
        {meetings.map((m) => (
          <button type="button" key={m.id} className="project-meeting-row" onClick={() => openMeeting(m.id)}>
            <Icon name="calendar" size={16} />
            <span className="project-meeting-title">{m.title}</span>
            <span className="project-meeting-date">
              {new Date(m.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
            </span>
          </button>
        ))}
        {meetings.length === 0 ? (
          <div className="project-empty">
            <Icon name="calendar" size={32} />
            <p>这个 Project 还没有 Meeting</p>
            <button type="button" className="btn ghost" onClick={createMeeting}>
              新建第一个 Meeting
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
