import { useEffect, useState } from 'react'
import type { PageSummary } from '../../../shared/ipc'
import { useUiStore } from '../stores/uiStore'
import { useAppStore } from '../stores/appStore'

export function TrashView() {
  const [items, setItems] = useState<PageSummary[]>([])
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const reload = (): void => {
    void window.oasis.pages.trashList().then(setItems)
  }
  useEffect(reload, [])

  return (
    <div className="trash-view">
      <h1 className="trash-title">回收站</h1>
      <p className="trash-sub">移入回收站的页面可在彻底删除前恢复。彻底删除会连同其中的录音文件一起清除。</p>
      <div className="trash-list">
        {items.length === 0 ? <div className="trash-empty">回收站是空的</div> : null}
        {items.map((p) => (
          <div key={p.id} className="trash-item">
            <span className="trash-icon">{p.icon ?? '📄'}</span>
            <span className="trash-name">{p.title}</span>
            <span className="trash-time">删除于 {new Date(p.deletedAt ?? p.updatedAt).toLocaleString('zh-CN')}</span>
            <div className="trash-actions">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  void window.oasis.pages.restore(p.id).then(() => {
                    reload()
                    void useAppStore.getState().refresh()
                  })
                }}
              >
                恢复
              </button>
              {confirmId === p.id ? (
                <>
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => {
                      setConfirmId(null)
                      void window.oasis.pages.deletePermanent(p.id).then(() => {
                        reload()
                        void useAppStore.getState().refresh()
                        useUiStore.getState().showToast('已彻底删除')
                      })
                    }}
                  >
                    确认彻底删除
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setConfirmId(null)}>
                    取消
                  </button>
                </>
              ) : (
                <button type="button" className="btn danger-ghost small" onClick={() => setConfirmId(p.id)}>
                  彻底删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
