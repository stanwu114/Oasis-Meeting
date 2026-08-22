import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { Icon } from './Icon'
import type { PageSummary } from '../../../shared/ipc'

type DropZone = 'before' | 'after' | 'inside'

export function PageTree() {
  const pages = useAppStore((s) => s.pages)
  const expanded = useAppStore((s) => s.expanded)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: DropZone } | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  const roots = pages.filter((p) => p.parentId === null)
  const childrenOf = (id: string): PageSummary[] => pages.filter((p) => p.parentId === id)

  const commitDrop = (targetId: string, zone: DropZone): void => {
    if (!dragId || dragId === targetId) return
    void useAppStore.getState().moveRelative(dragId, targetId, zone)
  }

  const renderRow = (page: PageSummary, depth: number): React.ReactNode => {
    const children = childrenOf(page.id)
    const isExpanded = expanded[page.id] ?? false
    const drop = dropTarget?.id === page.id ? dropTarget.zone : null

    return (
      <div key={page.id}>
        <div
          className={`page-row${drop ? ` drop-${drop}` : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            setDragId(page.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            setDragId(null)
            setDropTarget(null)
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === page.id) return
            e.preventDefault()
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = (e.clientY - rect.top) / rect.height
            setDropTarget({ id: page.id, zone: ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside' })
          }}
          onDragLeave={() => {
            if (dropTarget?.id === page.id) setDropTarget(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = (e.clientY - rect.top) / rect.height
            commitDrop(page.id, ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside')
            setDropTarget(null)
            setDragId(null)
          }}
          onClick={() => {
            useUiStore.getState().setView('editor')
            void useAppStore.getState().openPage(page.id)
          }}
          onDoubleClick={() => setEditingId(page.id)}
        >
          <button
            type="button"
            className={`chevron${children.length === 0 ? ' empty' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              useAppStore.getState().toggleExpand(page.id)
            }}
          >
            {children.length > 0 ? <Icon name="chevron" size={13} className={isExpanded ? 'chev expanded' : 'chev'} /> : null}
          </button>
          <span className="page-icon">
            {page.icon === 'project' || children.length > 0 || expanded[page.id]
              ? <Icon name="folder" size={14} className="icon-project" />
              : <Icon name="calendar" size={14} />}
          </span>
          {editingId === page.id ? (
            <input
              className="rename-input"
              autoFocus
              defaultValue={page.title}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                setEditingId(null)
                void useAppStore.getState().renamePage(page.id, e.target.value.trim() || '无标题')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
          ) : (
            <span className="page-title-text">{page.title}</span>
          )}
          <button
            type="button"
            className="row-menu-btn"
            onClick={(e) => {
              e.stopPropagation()
              setMenuId(menuId === page.id ? null : page.id)
            }}
          >
            <Icon name="dots" size={14} />
          </button>
          {menuId === page.id ? (
            <div className="row-menu" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setMenuId(null)
                  void useAppStore.getState().createPage(page.id)
                }}
              >
                归档 Meeting 到此
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuId(null)
                  setEditingId(page.id)
                }}
              >
                重命名
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setMenuId(null)
                  void useAppStore.getState().trashPage(page.id)
                }}
              >
                移到回收站
              </button>
            </div>
          ) : null}
        </div>
        {isExpanded ? children.map((c) => renderRow(c, depth + 1)) : null}
      </div>
    )
  }

  return (
    <div className="page-tree" onDragLeave={() => setDropTarget(null)}>
      {roots.map((p) => renderRow(p, 0))}
      {roots.length === 0 ? <div className="tree-empty">暂无页面,点击上方「新建页面」开始</div> : null}
    </div>
  )
}
