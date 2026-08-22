import { useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useUiStore } from '../stores/uiStore'
import { ChatMessagesList, ChatComposer, ChatHistoryList } from './chatParts'

/** 全屏 AI 界面:左侧会话栏 + 右侧对话区(⇧⌘J 与笔记界面互切) */
export function ChatWorkspace() {
  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)

  useEffect(() => {
    void useChatStore.getState().load()
  }, [])

  const title = conversations.find((c) => c.id === currentId)?.title ?? '新对话'

  return (
    <div className="chat-workspace">
      <aside className="chat-side-col">
        <div className="chat-side-top">
          <button
            type="button"
            className="btn primary chat-new-btn"
            onClick={() => useChatStore.getState().newChat()}
          >
            ✚ 新对话
          </button>
          <button
            type="button"
            className="icon-btn"
            title="返回笔记 (⇧⌘J)"
            onClick={() => useUiStore.getState().setView('editor')}
          >
            ←
          </button>
        </div>
        <div className="chat-side-list">
          <ChatHistoryList />
        </div>
        <div className="chat-side-foot">AI 由 DeepSeek 驱动 · 数据存本机</div>
      </aside>

      <div className="chat-main-col">
        <div className="chat-main-head">
          <span className="chat-title">✨ {title}</span>
          <button
            type="button"
            className="icon-btn"
            title="返回笔记 (⇧⌘J)"
            onClick={() => useUiStore.getState().setView('editor')}
          >
            ✕
          </button>
        </div>
        <ChatMessagesList />
        <ChatComposer />
      </div>
    </div>
  )
}
