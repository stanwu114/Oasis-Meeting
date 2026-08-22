import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { getEditor } from '../editor/bridge'
import { Icon } from './Icon'

type Action = 'summarize' | 'polish' | 'proofread' | 'explain' | 'translate' | 'continue' | 'ask'

const AI_ACTIONS: { key: Action; label: string }[] = [
  { key: 'polish', label: '润色' },
  { key: 'proofread', label: '校对' },
  { key: 'explain', label: '解释' },
  { key: 'translate', label: '翻译' },
  { key: 'summarize', label: '总结' },
  { key: 'ask', label: '问AI' }
]

const HIGHLIGHT_COLORS = [
  { name: '', label: '清除', css: 'transparent' },
  { name: 'yellow', label: '黄', css: '#fef3c7' },
  { name: 'green', label: '绿', css: '#d1fae5' },
  { name: 'blue', label: '蓝', css: '#dbeafe' },
  { name: 'red', label: '红', css: '#fee2e2' },
  { name: 'purple', label: '紫', css: '#f3e8ff' }
]

/** 划词悬浮条:格式(B/I/U/着重色)+ AI 动作 */
export function AiSelectionBar() {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [phase, setPhase] = useState<'idle' | 'loading' | 'result' | 'error'>('idle')
  const [result, setResult] = useState('')
  const [question, setQuestion] = useState('')
  const [askMode, setAskMode] = useState(false)
  const [error, setError] = useState('')
  const [showColors, setShowColors] = useState(false)
  const selectedText = useRef('')
  const view = useUiStore((s) => s.view)

  const run = async (action: Action): Promise<void> => {
    const text = selectedText.current
    if (!text || phase === 'loading') return
    if (action === 'ask' && !askMode) {
      setAskMode(true)
      return
    }
    if (action === 'ask' && !question.trim()) return
    setPhase('loading')
    setShowColors(false)
    try {
      const out = await window.oasis.ai.editorAction(action, text, action === 'ask' ? question.trim() : undefined)
      setResult(out)
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  /* 格式操作 */
  const toggleStyle = (style: string): void => {
    const editor = getEditor()
    if (!editor) return
    try {
      const fn = editor as unknown as { toggleStyles?: (s: Record<string, unknown>) => void }
      if (fn.toggleStyles) {
        fn.toggleStyles({ [style]: true })
      }
    } catch {
      document.execCommand(style)
    }
  }

  const setHighlight = (color: string): void => {
    const editor = getEditor()
    if (!editor) return
    try {
      const fn = editor as unknown as {
        removeStyles?: (s: Record<string, unknown>) => void
        toggleStyles?: (s: Record<string, unknown>) => void
      }
      if (fn.removeStyles) fn.removeStyles({ backgroundColor: [] })
      if (color && fn.toggleStyles) fn.toggleStyles({ backgroundColor: color })
    } catch {
      /* noop */
    }
    setShowColors(false)
  }

  useEffect(() => {
    const onSelect = (): void => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!sel || sel.isCollapsed || text.length < 2 || text.length > 8000) {
        setVisible(false)
        setPhase('idle')
        setAskMode(false)
        setShowColors(false)
        return
      }
      const node = sel.anchorNode
      const inEditor = node?.parentElement?.closest?.('.bn-editor')
      if (!inEditor) {
        setVisible(false)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      selectedText.current = text
      setPos({ top: Math.max(8, rect.top - 52), left: Math.max(12, rect.left + rect.width / 2 - 180) })
      setPhase('idle')
      setAskMode(false)
      setShowColors(false)
      setVisible(true)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setVisible(false)
    }
    const onScroll = (): void => setVisible(false)
    document.addEventListener('selectionchange', onSelect)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('selectionchange', onSelect)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  if (!visible || view !== 'editor') return null

  return (
    <div className="ai-sel" style={{ top: pos.top, left: pos.left }}>
      {/* ─── 格式 + AI 动作 ─── */}
      {phase === 'idle' && !askMode ? (
        <div className="ai-sel-bar">
          <button type="button" className="ai-fmt-btn" title="粗体" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleStyle('bold')}>
            <strong>B</strong>
          </button>
          <button type="button" className="ai-fmt-btn" title="斜体" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleStyle('italic')}>
            <em>I</em>
          </button>
          <button type="button" className="ai-fmt-btn" title="下划线" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleStyle('underline')}>
            <span style={{ textDecoration: 'underline' }}>U</span>
          </button>
          <span className="ai-sel-sep" />
          <button
            type="button"
            className="ai-fmt-btn"
            title="着重色"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowColors((v) => !v)}
          >
            <Icon name="sparkles" size={12} />
          </button>
          <span className="ai-sel-sep" />
          {AI_ACTIONS.map((a) => (
            <button key={a.key} type="button" className="ai-sel-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => void run(a.key)}>
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 着重色色板 */}
      {showColors && phase === 'idle' ? (
        <div className="ai-color-palette">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.name || 'none'}
              type="button"
              className={`ai-color-swatch${c.name === '' ? ' none' : ''}`}
              style={{ background: c.css }}
              title={c.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setHighlight(c.name)}
            />
          ))}
        </div>
      ) : null}

      {/* 问AI 输入 */}
      {askMode && phase === 'idle' ? (
        <div className="ai-sel-ask">
          <input
            autoFocus
            className="ai-sel-input"
            placeholder="基于选中内容提问…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run('ask')
              if (e.key === 'Escape') setAskMode(false)
            }}
          />
          <button type="button" className="btn primary small" onClick={() => void run('ask')}>
            发送
          </button>
        </div>
      ) : null}

      {/* AI 结果 */}
      {phase === 'loading' ? (
        <div className="ai-sel-panel">
          <span className="spin" /> AI 正在处理…
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="ai-sel-panel">
          <div className="ai-sel-error">{error}</div>
          <button type="button" className="btn ghost small" onClick={() => setPhase('idle')}>
            返回
          </button>
        </div>
      ) : null}

      {phase === 'result' ? (
        <div className="ai-sel-panel">
          <textarea className="ai-sel-result" value={result} onChange={(e) => setResult(e.target.value)} rows={Math.min(12, result.split('\n').length + 1)} />
          <div className="ai-sel-actions">
            <button
              type="button"
              className="btn primary small"
              onClick={() => {
                const editor = getEditor()
                if (!editor) return
                try {
                  const anchor = editor.getTextCursorPosition().block
                  const blocks = result
                    .split('\n')
                    .filter((l) => l.trim())
                    .map((line) => ({
                      type: /^[-*]\s/.test(line) ? 'bulletListItem' : 'paragraph',
                      content: [{ type: 'text', text: line.replace(/^[-*]\s/, ''), styles: {} }]
                    }))
                  if (blocks.length > 0) editor.insertBlocks(blocks as never, anchor, 'after')
                  setVisible(false)
                  useUiStore.getState().showToast('已插入下方')
                } catch {
                  /* noop */
                }
              }}
            >
              插入下方
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                void navigator.clipboard.writeText(result)
                useUiStore.getState().showToast('已复制')
              }}
            >
              复制
            </button>
            <button type="button" className="btn ghost small" onClick={() => setPhase('idle')}>
              返回
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
