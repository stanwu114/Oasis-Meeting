import { useEffect, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useUiStore } from '../stores/uiStore'
import { ChatMessagesList, ChatComposer, ChatHistoryList } from './chatParts'

/** 右侧 AI 面板(Notion 式):紧凑,随写随问 */
export function ChatPanel() {
  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)
  const historyOpen = useChatStore((s) => s.historyOpen)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    void useChatStore.getState().load()
  }, [])

  const title = conversations.find((c) => c.id === currentId)?.title ?? 'AI'

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">✨ {title}</span>
        <div className="chat-header-actions">
          <button type="button" className="icon-btn" title="菜单" onClick={() => setMenuOpen((v) => !v)}>
            ⋯
          </button>
          <button type="button" className="icon-btn" title="收起 (⌘L)" onClick={() => useUiStore.getState().setChatOpen(false)}>
            ✕
          </button>
        </div>
        {menuOpen ? (
          <div className="chat-menu" onClick={() => setMenuOpen(false)}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                useChatStore.getState().setHistoryOpen(true)
              }}
            >
              🕘 查看历史
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                useChatStore.getState().newChat()
              }}
            >
              ✚ 新对话
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                useUiStore.getState().setView('ai')
                useUiStore.getState().setChatOpen(false)
              }}
            >
              ⤢ 打开完整 AI 界面
            </button>
          </div>
        ) : null}
      </div>

      {historyOpen ? (
        <div className="chat-history">
          <ChatHistoryList />
        </div>
      ) : null}

      <ChatMessagesList />
      <ChatComposer />
    </div>
  )
}
