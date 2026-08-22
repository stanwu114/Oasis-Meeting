import { useEffect, useState } from 'react'
import type { AiPanelState } from '../../../shared/ipc'

/** 内嵌 dsh web 的 AI 面板 */
export function AiPanel() {
  const [state, setState] = useState<AiPanelState>({ status: 'stopped', url: null, error: null })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    void window.oasis.ai.status().then(setState)
    return window.oasis.on.aiStateChanged(setState)
  }, [])

  const start = (): void => {
    void window.oasis.ai.start()
  }

  return (
    <div className="ai-panel">
      <div className="ai-toolbar">
        <span className={`ai-status-dot s-${state.status}`} />
        <span className="ai-status-label">
          {state.status === 'ready'
            ? 'DeepSeek Harness 运行中'
            : state.status === 'starting'
              ? '正在启动…'
              : state.status === 'error'
                ? '启动失败'
                : state.status === 'unavailable'
                  ? '不可用'
                  : '未启动'}
        </span>
        {state.status === 'ready' ? (
          <>
            <button type="button" className="btn ghost small" onClick={() => setReloadKey((k) => k + 1)}>
              ↻ 刷新
            </button>
            <button type="button" className="btn ghost small" onClick={() => void window.oasis.ai.stop()}>
              ⏹ 停止
            </button>
            {state.url ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => state.url && void window.oasis.system.openExternal(state.url)}
              >
                ↗ 浏览器打开
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {state.status === 'ready' && state.url ? (
        <webview key={reloadKey} src={state.url} className="ai-webview" partition="persist:dsh" />
      ) : (
        <div className="ai-placeholder">
          <div className="ai-placeholder-icon">🤖</div>
          {state.status === 'starting' ? (
            <>
              <h2>正在启动 DeepSeek Harness…</h2>
              <p>首次启动约需 10~20 秒,会话与凭据复用 ~/.dsh</p>
              <span className="spin ai-spin" />
            </>
          ) : state.status === 'error' ? (
            <>
              <h2>启动失败</h2>
              <p className="ai-error">{state.error}</p>
              <button type="button" className="btn primary" onClick={start}>
                重试
              </button>
            </>
          ) : state.status === 'unavailable' ? (
            <>
              <h2>AI 面板不可用</h2>
              <p>未找到 vendor/deepseek-harness 构建产物。请在项目根目录检出并构建 dsh 后重试。</p>
            </>
          ) : (
            <>
              <h2>AI 智能体面板</h2>
              <p>
                内嵌 DeepSeek Harness(dsh)Web UI:多智能体会话、技能与工作流。
                <br />
                与笔记并排使用,数据与凭据均在本地。
              </p>
              <button type="button" className="btn primary" onClick={start}>
                🚀 启动 AI 面板
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
