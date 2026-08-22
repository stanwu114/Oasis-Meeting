import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { SearchModal } from './components/SearchModal'
import { SettingsModal } from './components/SettingsModal'
import { TrashView } from './components/TrashView'
import { AiSelectionBar } from './components/AiSelectionBar'
import { HarnessView } from './components/HarnessView'
import MeetingPage from './components/MeetingPage'
import { ProjectView } from './components/ProjectView'
import { useAppStore } from './stores/appStore'
import { useUiStore } from './stores/uiStore'
import { useRecordingsStore } from './stores/recordingsStore'

export default function App() {
  const view = useUiStore((s) => s.view)
  const currentId = useAppStore((s) => s.currentId)
  const currentIcon = useAppStore((s) => s.currentIcon)
  const loaded = useAppStore((s) => s.loaded)
  const toast = useUiStore((s) => s.toast)
  const toastKind = useUiStore((s) => s.toastKind)

  /* 初始化 + 事件订阅 */
  useEffect(() => {
    void useAppStore.getState().init()
    void useUiStore.getState().initModel()

    const offRec = window.oasis.on.recordingsChanged((rec) => {
      useRecordingsStore.getState().upsert(rec)
    })
    const offModel = window.oasis.on.modelProgress((m) => {
      useUiStore.getState().setModelStatus(m)
    })
    const offAction = window.oasis.on.appAction((action) => {
      if (action === 'new-page') void useAppStore.getState().createPage(null)
    })
    return () => {
      offRec()
      offModel()
      offAction()
    }
  }, [])

  /* 全局快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUiStore.getState().setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {view === 'trash' ? (
          <TrashView />
        ) : view === 'harness' ? (
          <HarnessView />
        ) : loaded && currentId && currentIcon === 'project' ? (
          <ProjectView key={currentId} pageId={currentId} />
        ) : loaded && currentId ? (
          <MeetingPage key={currentId} pageId={currentId} />
        ) : (
          <EmptyState />
        )}
      </main>

      <AiSelectionBar />
      <SearchModal />
      <SettingsModal />
      {toast ? <div className={`toast ${toastKind === 'error' ? 'error' : ''}`}>{toast}</div> : null}
    </div>
  )
}

function EmptyState(): React.ReactNode {
  return (
    <div className="empty-state">
      <div className="empty-wordmark">Oasis <span className="note">Meeting</span></div>
      <p>本地优先的会议记录空间 · 录音在本机转写,数据不出电脑</p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={() => void useAppStore.getState().createPage(null)}>
          ＋ 新建 Meeting
        </button>
      </div>
    </div>
  )
}
