import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { RecorderOverlay } from './components/RecorderOverlay'
import { SearchModal } from './components/SearchModal'
import { SettingsModal } from './components/SettingsModal'
import { TrashView } from './components/TrashView'
import { RecordingsView } from './components/RecordingsView'
import { AiSelectionBar } from './components/AiSelectionBar'
import { ChatPanel } from './components/ChatPanel'
import { useChatStore } from './stores/chatStore'
import OasisEditor from './editor/OasisEditor'
import { useAppStore } from './stores/appStore'
import { useUiStore } from './stores/uiStore'
import { useRecordingsStore } from './stores/recordingsStore'
import { useRecorderStore } from './stores/recorderStore'

export default function App() {
  const view = useUiStore((s) => s.view)
  const chatOpen = useUiStore((s) => s.chatOpen)
  const currentId = useAppStore((s) => s.currentId)
  const loaded = useAppStore((s) => s.loaded)
  const toast = useUiStore((s) => s.toast)
  const toastKind = useUiStore((s) => s.toastKind)
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem('oasis.chatWidth'))
    return saved >= 320 && saved <= 640 ? saved : 400
  })
  const chatWidthRef = useRef(chatWidth)
  chatWidthRef.current = chatWidth

  /* 拖拽调整 AI 分栏宽度 */
  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chatWidthRef.current
    const onMove = (ev: MouseEvent): void => {
      setChatWidth(Math.max(320, Math.min(640, startWidth + (startX - ev.clientX))))
    }
    const onUp = (): void => {
      localStorage.setItem('oasis.chatWidth', String(chatWidthRef.current))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

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
    const offDelta = window.oasis.on.aiChatDelta((d) => {
      useChatStore.getState().onDelta(d.conversationId, d.delta)
    })
    const offDone = window.oasis.on.aiChatDone((d) => {
      useChatStore.getState().onDone(d.conversationId, d.content)
    })
    const offErr = window.oasis.on.aiChatError((e) => {
      useChatStore.getState().onError(e.conversationId, e.error)
    })
    const offStatus = window.oasis.on.aiChatStatus((s) => {
      useChatStore.getState().onStatus(s.conversationId, s.status)
    })
    return () => {
      offRec()
      offModel()
      offAction()
      offDelta()
      offDone()
      offErr()
      offStatus()
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
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        useUiStore.getState().setChatOpen(!useUiStore.getState().chatOpen)
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        useUiStore.getState().setChatOpen(!useUiStore.getState().chatOpen)
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        const phase = useRecorderStore.getState().phase
        if (phase === 'idle') void useRecorderStore.getState().start()
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
        ) : view === 'recordings' ? (
          <RecordingsView />
        ) : loaded && currentId ? (
          <OasisEditor key={currentId} pageId={currentId} />
        ) : (
          <EmptyState />
        )}
      </main>
      {chatOpen ? (
        <>
          <div className="chat-resize-handle" onMouseDown={startResize} />
          <aside className="chat-drawer" style={{ width: chatWidth }}>
            <ChatPanel />
          </aside>
        </>
      ) : null}

      {!chatOpen ? (
        <button
          type="button"
          className="ai-toggle-fab"
          style={{ bottom: view === 'editor' && loaded && currentId ? 104 : 34 }}
          title="打开 AI (⇧⌘J)"
          onClick={() => useUiStore.getState().setChatOpen(true)}
        >
          ✨
        </button>
      ) : null}

      <RecorderOverlay />
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
      <div className="empty-logo">🏝</div>
      <h1>Notion Oasis</h1>
      <p>本地优先的笔记空间 · 录音在本机转写,数据不出电脑</p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={() => void useAppStore.getState().createPage(null)}>
          ＋ 新建笔记
        </button>
        <button type="button" className="btn ghost" onClick={() => void useRecorderStore.getState().start()}>
          🎙 快速录音(自动建笔记)
        </button>
      </div>
    </div>
  )
}
