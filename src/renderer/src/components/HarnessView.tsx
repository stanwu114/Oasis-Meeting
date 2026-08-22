import { useEffect, useState } from 'react'
import { useHarnessStore } from '../stores/harnessStore'
import { useUiStore } from '../stores/uiStore'

/** Harness 界面:主区域整体切换为 dsh web(webview),左栏由侧栏切为历史会话 */
export function HarnessView() {
  const state = useHarnessStore((s) => s.state)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    void useHarnessStore.getState().init()
    if (state.status === 'stopped' || state.status === 'error') void useHarnessStore.getState().start()
    return window.oasis.on.harnessStateChanged((s) => useHarnessStore.getState().setState(s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="harness-view">
      <div className="harness-toolbar">
        <button type="button" className="btn ghost small" onClick={() => useUiStore.getState().setView('editor')}>
          ← 返回笔记
        </button>
        <span className={`ai-status-dot s-${state.status}`} />
        <span className="harness-status-label">
          {state.status === 'ready'
            ? 'DeepSeek Harness 运行中'
            : state.status === 'starting'
              ? '正在启动 dsh(约 10~20 秒)…'
              : state.status === 'error'
                ? '启动失败'
                : state.status === 'unavailable'
                  ? '未找到 deepseek-harness 检出'
                  : '未运行'}
        </span>
        {state.error ? <span className="harness-error">{state.error}</span> : null}
        <div className="harness-toolbar-actions">
          {state.status === 'ready' ? (
            <>
              <button type="button" className="btn ghost small" onClick={() => setReloadKey((k) => k + 1)}>
                ↻ 刷新
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  void window.oasis.harness.stop()
                  useHarnessStore.getState().setState({ status: 'stopped', url: null, error: null })
                }}
              >
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
          ) : state.status === 'error' || state.status === 'stopped' ? (
            <button type="button" className="btn primary small" onClick={() => void useHarnessStore.getState().start()}>
              重新启动
            </button>
          ) : null}
        </div>
      </div>

      {state.status === 'ready' && state.url ? (
        <webview key={reloadKey} src={state.url} className="harness-webview" partition="persist:dsh" allowpopups />
      ) : (
        <div className="harness-placeholder">
          <div className="ai-placeholder-icon">🧩</div>
          {state.status === 'starting' ? (
            <>
              <h2>正在启动 DeepSeek Harness…</h2>
              <p>加载你 profile 里的全部插件,会话与凭据复用 ~/.dsh</p>
              <span className="spin ai-spin" />
            </>
          ) : state.status === 'error' ? (
            <>
              <h2>启动失败</h2>
              <p className="harness-error">{state.error}</p>
            </>
          ) : state.status === 'unavailable' ? (
            <>
              <h2>未找到 deepseek-harness</h2>
              <p>请在项目根目录放置 deepseek-harness 检出(含构建产物与 node_modules)。</p>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
