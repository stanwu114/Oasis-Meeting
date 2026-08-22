import { useEffect, useRef, useState } from 'react'
import { useChatStore, type ChatMode } from '../stores/chatStore'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { insertParagraphsAfterSelection } from '../editor/bridge'

const CHAT_SUGGESTIONS = [
  { label: '📝 总结当前页面', text: '帮我总结一下当前这篇笔记,给出要点。' },
  { label: '✅ 提取待办', text: '从当前笔记里提取所有待办事项和行动项。' },
  { label: '💡 续写建议', text: '基于当前笔记,给我 3 个可以继续展开的方向建议。' }
]

const AGENT_SUGGESTIONS = [
  { label: '🗂 整理工作目录', text: '列出当前工作目录下的主要文件,并按用途分类说明。' },
  { label: '🔍 分析笔记工程', text: '查看当前笔记目录里最近修改的文件,总结最近在做什么。' },
  { label: '📊 生成页面清单', text: '基于当前笔记内容,帮我规划下一步行动并说明理由。' }
]

/** 原生 AI 对话抽屉:💬 直连对话 / 🤖 智能体(SDK 驱动,带工具)双模式 */
export function ChatPanel() {
  const mode = useChatStore((s) => s.mode)
  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)
  const messages = useChatStore((s) => s.messages)
  const streamingText = useChatStore((s) => s.streamingText)
  const statusText = useChatStore((s) => s.statusText)
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

  const title = conversations.find((c) => c.id === currentId)?.title ?? (mode === 'agent' ? '智能体任务' : '新对话')
  const suggestions = mode === 'agent' ? AGENT_SUGGESTIONS : CHAT_SUGGESTIONS

  return (
    <div className="chat-panel">
      <div className="chat-tabs">
        <button
          type="button"
          className={`chat-tab${mode === 'chat' ? ' on' : ''}`}
          onClick={() => void useChatStore.getState().setMode('chat' as ChatMode)}
        >
          💬 对话
        </button>
        <button
          type="button"
          className={`chat-tab${mode === 'agent' ? ' on' : ''}`}
          onClick={() => void useChatStore.getState().setMode('agent' as ChatMode)}
        >
          🤖 智能体
        </button>
        <div className="chat-header-actions">
          <button type="button" className="icon-btn" title={mode === 'agent' ? '新任务' : '新对话'} onClick={() => useChatStore.getState().newChat()}>
            ＋
          </button>
          <button type="button" className="icon-btn" title="关闭 (⌘L)" onClick={() => useUiStore.getState().setChatOpen(false)}>
            ✕
          </button>
        </div>
      </div>

      <div className="chat-header">
        <button type="button" className="chat-title" onClick={() => useChatStore.getState().setHistoryOpen(!historyOpen)}>
          {title} <span className="chat-caret">{historyOpen ? '▾' : '▸'}</span>
        </button>
        {mode === 'agent' ? <span className="chat-mode-hint">可执行工具与命令</span> : null}
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
            <div className="chat-welcome-icon">{mode === 'agent' ? '🤖' : '💬'}</div>
            <p>
              {mode === 'agent' ? (
                <>
                  智能体模式:由 DeepSeek Harness 引擎驱动,<b>可执行工具与命令</b>(读写文件、运行 bash 等),
                  过程会显示思考与工具调用状态。
                </>
              ) : (
                <>
                  和 AI 对话,它会自动带上
                  <b>当前笔记{contextPageOn && pageId ? `「${pageTitle || '无标题'}」` : ''}</b>
                  的内容作为上下文。
                </>
              )}
            </p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s.label} type="button" onClick={() => send(s.text)}>
                  {s.label}
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
            placeholder={sending ? 'AI 正在回复…' : mode === 'agent' ? '给智能体下任务… (Enter 发送)' : '问点什么… (Enter 发送,Shift+Enter 换行)'}
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
    </div>
  )
}
