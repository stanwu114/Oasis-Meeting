import { useCallback, useEffect, useRef, useState } from 'react'
import { insertParagraphsAfterSelection } from '../editor/bridge'
import { useUiStore } from '../stores/uiStore'

type Action = 'summarize' | 'polish' | 'proofread' | 'explain' | 'translate' | 'continue' | 'ask'

const ACTIONS: { key: Action; label: string }[] = [
  { key: 'polish', label: '✨ 润色写作' },
  { key: 'proofread', label: '校对' },
  { key: 'explain', label: '解释' },
  { key: 'translate', label: '翻译' },
  { key: 'summarize', label: '总结' },
  { key: 'ask', label: '问AI' }
]

/** 编辑器内划词后浮现的 AI 工具条;结果可编辑后插入光标处 */
export function AiSelectionBar() {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [phase, setPhase] = useState<'idle' | 'loading' | 'result' | 'error'>('idle')
  const [result, setResult] = useState('')
  const [question, setQuestion] = useState('')
  const [askMode, setAskMode] = useState(false)
  const [error, setError] = useState('')
  const view = useUiStore((s) => s.view)
  const selectedText = useRef('')

  const run = useCallback(async (action: Action): Promise<void> => {
    const text = selectedText.current
    if (!text || phase === 'loading') return
    if (action === 'ask' && !askMode) {
      setAskMode(true)
      return
    }
    if (action === 'ask' && !question.trim()) return
    setPhase('loading')
    try {
      const out = await window.oasis.ai.editorAction(action, text, action === 'ask' ? question.trim() : undefined)
      setResult(out)
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [phase, askMode, question])

  useEffect(() => {
    const onSelect = (): void => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!sel || sel.isCollapsed || text.length < 2 || text.length > 8000) {
        setVisible(false)
        setPhase('idle')
        setAskMode(false)
        return
      }
      // 只在编辑器内生效
      const node = sel.anchorNode
      const inEditor = node?.parentElement?.closest?.('.bn-editor')
      if (!inEditor) {
        setVisible(false)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      selectedText.current = text
      setPos({ top: Math.max(8, rect.top - 46), left: Math.max(12, rect.left + rect.width / 2 - 150) })
      setPhase('idle')
      setAskMode(false)
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
      {phase === 'idle' && !askMode ? (
        <div className="ai-sel-bar">
          {ACTIONS.map((a) => (
            <button key={a.key} type="button" className="ai-sel-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => void run(a.key)}>
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

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
                if (insertParagraphsAfterSelection(result)) {
                  setVisible(false)
                  useUiStore.getState().showToast('已插入笔记')
                }
              }}
            >
              ✓ 插入下方
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
