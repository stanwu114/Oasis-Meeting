import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { Icon } from './Icon'
import type { SearchResult } from '../../../shared/ipc'

/** 安全高亮:split + React 节点(不用 dangerouslySetInnerHTML) */
function HighlightedText({ text, q }: { text: string; q: string }): React.ReactNode {
  if (!q || !text) return <>{text}</>
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase()
          ? <mark key={i} className="console-highlight">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

/** 搜索结果页:在右侧主区域显示 */
export function SearchResults({ results, query }: { results: SearchResult[]; query: string }): React.ReactNode {
  const openPage = (pageId: string): void => {
    useUiStore.getState().setHighlightQuery(query)
    useUiStore.getState().setView('editor')
    useUiStore.getState().setSearch('', [])
    void useAppStore.getState().openPage(pageId)
  }

  return (
    <div className="search-results-view">
      <div className="search-results-head">
        <Icon name="search" size={18} />
        <span className="search-results-title">「{query}」的搜索结果</span>
        <span className="search-results-count">{results.length} 条</span>
      </div>

      <div className="search-results-list">
        {results.map((r) => (
          <button type="button" key={r.pageId} className="search-result-item" onClick={() => openPage(r.pageId)}>
            <Icon name="calendar" size={15} />
            <div className="search-result-body">
              <span className="search-result-title"><HighlightedText text={r.title} q={query} /></span>
              {r.snippet ? (
                <span className="search-result-snippet"><HighlightedText text={r.snippet} q={query} /></span>
              ) : null}
            </div>
          </button>
        ))}
        {results.length === 0 ? (
          <div className="search-results-empty">
            <Icon name="search" size={28} />
            <p>没有找到包含「{query}」的会议</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
