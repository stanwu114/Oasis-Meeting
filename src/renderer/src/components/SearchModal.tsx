import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { useAppStore } from '../stores/appStore'
import type { SearchResult } from '../../../shared/ipc'

/** ⌘K 全文搜索弹窗 */
export function SearchModal() {
  const open = useUiStore((s) => s.searchOpen)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    setActive(0)
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = window.setTimeout(() => {
      void window.oasis.search.query(q).then((r) => {
        setResults(r)
        setActive(0)
      })
    }, 160)
    return () => window.clearTimeout(t)
  }, [query, open])

  if (!open) return null

  const close = (): void => useUiStore.getState().setSearchOpen(false)
  const openResult = (pageId: string): void => {
    useUiStore.getState().setView('editor')
    void useAppStore.getState().openPage(pageId)
    close()
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-card search-card" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="搜索页面标题与正文…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            }
            if (e.key === 'Enter' && results[active]) openResult(results[active].pageId)
          }}
        />
        <div className="search-results">
          {query.trim() && results.length === 0 ? (
            <div className="search-empty">没有找到匹配「{query}」的页面</div>
          ) : null}
          {results.map((r, i) => (
            <button
              type="button"
              key={r.pageId}
              className={`search-result${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => openResult(r.pageId)}
            >
              <span className="search-result-icon">{r.icon ?? '📄'}</span>
              <span className="search-result-body">
                <span className="search-result-title">{r.title}</span>
                {r.snippet ? <span className="search-result-snippet">{r.snippet}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
