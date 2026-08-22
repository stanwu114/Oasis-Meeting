import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { insertParagraphsAfterSelection } from '../editor/bridge'

/** 原生 AI 对话抽屉:笔记上下文感知,流式输出,回复可一键写回笔记 */
export function ChatPanel() {
  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)
  const messages = useChatStore((s) => s.messages)
  const streamingText = useChatStore((s) => s.streamingText)
  const sending = useChatStore((s) => s.sending)
  const contextPageOn = useChatStore((s) => s.contextPageOn)
  const historyOpen = useChatStore((s) => s.historyOpen)
  const pageTitle = useAppStore((s) => s.currentTitle)
  const pageId = useAppStore((s) => s.currentId)

  const [input, setInput] = useState('')
  const [selectionLen, setSelectionLen] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void useChatStore.getState().load()
  }, [])

  /* 流式时自动滚底 */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, streamingText])

  /* 选区长度提示 */
  useEffect(() => {
    const onSel = (): void => setSelectionLen((window.getSelection()?.toString().trim().length ?? 0))
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  const send = (text?: string): void => {
    const value = (text ?? input).trim()
    if (!value || sending) return
    setInput('')
    void useChatStore.getState().send(value)
  }

  const title = conversations.find((c) => c.id === currentId)?.title ?? '新对话'

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <button type="button" className="chat-title" onClick={() => useChatStore.getState().setHistoryOpen(!historyOpen)}>
          {title} <span className="chat-caret">{historyOpen ? '▾' : '▸'}</span>
        </button>
        <div className="chat-header-actions">
          <button type="button" className="icon-btn" title="新对话" onClick={() => useChatStore.getState().newChat()}>
            ＋
          </button>
          <button type="button" className="icon-btn" title="关闭 (⌘L)" onClick={() => useUiStore.getState().setChatOpen(false)}>
            ✕
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div className="chat-history">
          {conversations.map((c) => (
            <div key={c.id} className={`chat-history-item${c.id === currentId ? ' active' : ''}`}>
              <button type="button" className="chat-history-btn" onClick={() => void useChatStore.getState().select(c.id)}>
                {c.title}
              </button>
              <button
                type="button"
                className="chat-history-del"
                title="删除对话"
                onClick={() => void useChatStore.getState().remove(c.id)}
              >
                ✕
              </button>
            </div>
          ))}
          {conversations.length === 0 ? <div className="chat-history-empty">还没有历史对话</div> : null}
        </div>
      ) : null}

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && !streamingText ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">💬</div>
            <p>
              和 AI 对话,它会自动带上
              <b>当前笔记{contextPageOn && pageId ? `「${pageTitle || '无标题'}」` : ''}</b>
              的内容作为上下文。
            </p>
            <div className="chat-suggestions">
              <button type="button" onClick={() => send('帮我总结一下当前这篇笔记,给出要点。')}>
                📝 总结当前页面
              </button>
              <button type="button" onClick={() => send('从当前笔记里提取所有待办事项和行动项。')}>
                ✅ 提取待办
              </button>
              <button type="button" onClick={() => send('基于当前笔记,给我 3 个可以继续展开的方向建议。')}>
                💡 续写建议
              </button>
            </div>
          </div>
        ) : null}

        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
            {m.role === 'assistant' ? (
              <div className="chat-msg-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    if (insertParagraphsAfterSelection(m.content)) useUiStore.getState().showToast('已插入当前笔记')
                  }}
                >
                  插入笔记
                </button>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(m.content)
                    useUiStore.getState().showToast('已复制')
                  }}
                >
                  复制
                </button>
              </div>
            ) : null}
          </div>
        ))}

        {streamingText ? (
          <div className="chat-msg assistant">
            <div className="chat-bubble streaming">
              {streamingText}
              <span className="chat-cursor" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="chat-input-area">
        <div className="chat-context-row">
          <button
            type="button"
            className={`chat-chip${contextPageOn ? ' on' : ''}`}
            onClick={() => useChatStore.getState().toggleContextPage()}
            title="发送时附带当前页面内容"
          >
            📌 引用当前页面{contextPageOn && pageTitle ? `:${pageTitle.slice(0, 12)}` : ''}
          </button>
          {selectionLen >= 2 ? <span className="chat-chip on static">✂️ 选中 {selectionLen} 字</span> : null}
        </div>
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={sending ? 'AI 正在回复…' : '问点什么… (Enter 发送,Shift+Enter 换行)'}
            value={input}
            rows={Math.min(4, input.split('\n').length)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          {sending ? (
            <button type="button" className="chat-send stop" title="停止生成" onClick={() => useChatStore.getState().stop()}>
              ⏹
            </button>
          ) : (
            <button type="button" className="chat-send" title="发送" disabled={!input.trim()} onClick={() => send()}>
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
