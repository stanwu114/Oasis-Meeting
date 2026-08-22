import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { insertParagraphsAfterSelection } from '../editor/bridge'

/** Notion 式快捷动作(带页面上下文发送) */
export const QUICK_ACTIONS = [
  { label: '📝 总结本页', text: '总结当前这篇笔记,给出要点。' },
  { label: '🔤 翻译', text: '把当前笔记内容翻译成英文(若已是英文则译成中文)。' },
  { label: '✨ 润色', text: '润色当前笔记:修正错别字与标点、理顺语句,保持原意。' },
  { label: '✅ 提取待办', text: '从当前笔记里提取所有待办事项与行动项。' }
]

/** 消息流(含欢迎态/流式/状态行/回复动作) */
export function ChatMessagesList(): React.ReactNode {
  const messages = useChatStore((s) => s.messages)
  const streamingText = useChatStore((s) => s.streamingText)
  const statusText = useChatStore((s) => s.statusText)
  const sending = useChatStore((s) => s.sending)
  const contextPageOn = useChatStore((s) => s.contextPageOn)
  const mode = useChatStore((s) => s.mode)
  const pageTitle = useAppStore((s) => s.currentTitle)
  const pageId = useAppStore((s) => s.currentId)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, streamingText, statusText])

  const send = (text: string): void => {
    if (!useChatStore.getState().sending) void useChatStore.getState().send(text)
  }

  return (
    <div className="chat-messages" ref={scrollRef}>
      {messages.length === 0 && !streamingText ? (
        <div className="chat-welcome">
          <div className="chat-welcome-icon">✨</div>
          <p>
            和 AI 一起处理
            <b>当前笔记{contextPageOn && pageId ? `「${pageTitle || '无标题'}」` : ''}</b>
            ——用快捷动作或直接提问;回复可一键写回笔记。
          </p>
          <div className="chat-suggestions">
            {QUICK_ACTIONS.map((a) => (
              <button key={a.label} type="button" disabled={!pageId} onClick={() => send(a.text)}>
                {a.label}
              </button>
            ))}
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
                  if (insertParagraphsAfterSelection(m.content)) useUiStore.getState().showToast('已插入下方')
                }}
              >
                ↓ 插入下方
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

      {streamingText || (sending && mode === 'agent') ? (
        <div className="chat-msg assistant">
          {statusText ? <div className="chat-status-line">{statusText}</div> : null}
          <div className="chat-bubble streaming">
            {streamingText || <span className="chat-cursor" />}
            {streamingText ? <span className="chat-cursor" /> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 输入区(快捷动作 + 上下文芯片 + 输入框) */
export function ChatComposer(): React.ReactNode {
  const mode = useChatStore((s) => s.mode)
  const sending = useChatStore((s) => s.sending)
  const contextPageOn = useChatStore((s) => s.contextPageOn)
  const pageTitle = useAppStore((s) => s.currentTitle)
  const pageId = useAppStore((s) => s.currentId)
  const [input, setInput] = useState('')
  const [selectionLen, setSelectionLen] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  return (
    <div className="chat-input-area">
      <div className="chat-quick-row">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            className="chat-quick-btn"
            disabled={sending || !pageId}
            title={pageId ? a.text : '先打开一篇笔记'}
            onClick={() => send(a.text)}
          >
            {a.label}
          </button>
        ))}
      </div>
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
        <button
          type="button"
          className={`chat-chip${mode === 'agent' ? ' on' : ''}`}
          title={mode === 'agent' ? '智能体模式:AI 可执行工具与命令(会开启新对话)' : '开启后 AI 可执行工具与命令(bash/文件读写)'}
          onClick={() => void useChatStore.getState().setMode(mode === 'agent' ? 'chat' : 'agent')}
        >
          {mode === 'agent' ? '🤖 工具执行 开' : '🤖 工具执行 关'}
        </button>
      </div>
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={sending ? 'AI 正在回复…' : mode === 'agent' ? '给 AI 下任务… (Enter 发送)' : '问点什么… (Enter 发送,Shift+Enter 换行)'}
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
        {sending && mode === 'chat' ? (
          <button type="button" className="chat-send stop" title="停止生成" onClick={() => useChatStore.getState().stop()}>
            ⏹
          </button>
        ) : (
          <button type="button" className="chat-send" title="发送" disabled={!input.trim() || sending} onClick={() => send()}>
            ↑
          </button>
        )}
      </div>
    </div>
  )
}

/** 会话历史列表 */
export function ChatHistoryList(): React.ReactNode {
  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)

  return (
    <>
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
    </>
  )
}
