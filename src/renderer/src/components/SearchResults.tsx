import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { Icon } from './Icon'
import type { SearchResult } from '../../../shared/ipc'

/** 搜索结果页:在右侧主区域显示 */
export function SearchResults({ results, query }: { results: SearchResult[]; query: string }): React.ReactNode {
  const openPage = (pageId: string): void => {
    useUiStore.getState().setView('editor')
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
              <span className="search-result-title">{r.title}</span>
              {r.snippet ? <span className="search-result-snippet">{r.snippet}</span> : null}
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
