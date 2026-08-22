import { useEffect } from 'react'
import { useHarnessStore } from '../stores/harnessStore'

/** Harness 模式:主区域整体为 dsh web 界面,无附加工具栏;启动中/失败显示覆盖层 */
export function HarnessView() {
  const state = useHarnessStore((s) => s.state)

  useEffect(() => {
    void useHarnessStore.getState().init()
    const current = useHarnessStore.getState().state.status
    if (current === 'stopped' || current === 'error') void useHarnessStore.getState().start()
    return window.oasis.on.harnessStateChanged((s) => useHarnessStore.getState().setState(s))
  }, [])

  return (
    <div className="harness-view">
      {state.status === 'ready' && state.url ? (
        <webview src={state.url} className="harness-webview" partition="persist:dsh" allowpopups />
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
              <button type="button" className="btn primary" onClick={() => void useHarnessStore.getState().start()}>
                重试
              </button>
            </>
          ) : state.status === 'unavailable' ? (
            <>
              <h2>未找到 deepseek-harness</h2>
              <p>请在项目根目录放置 deepseek-harness 检出(含构建产物与 node_modules)。</p>
            </>
          ) : (
            <>
              <h2>Harness 未运行</h2>
              <button type="button" className="btn primary" onClick={() => void useHarnessStore.getState().start()}>
                启动
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
