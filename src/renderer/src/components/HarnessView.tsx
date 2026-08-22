import { useEffect } from 'react'
import { setHarnessWebview, useHarnessStore } from '../stores/harnessStore'

/** 隐藏 dsh 自带的会话侧栏与拖拽手柄 */
const HIDE_DSH_SIDEBAR_CSS =
  '[class*="sidebarCol"] { display: none !important; } [class*="_handle"] { display: none !important; }'

interface WebviewTagLike extends HTMLElement {
  executeJavaScript(code: string): Promise<unknown>
  insertCSS(css: string): Promise<string>
}

/** Harness 模式:主区域整体为 dsh 会话界面(dsh 自带侧栏已隐藏);启动中/失败显示覆盖层 */
export function HarnessView() {
  const state = useHarnessStore((s) => s.state)

  useEffect(() => {
    void useHarnessStore.getState().init()
    const current = useHarnessStore.getState().state.status
    if (current === 'stopped' || current === 'error') void useHarnessStore.getState().start()
    return window.oasis.on.harnessStateChanged((s) => useHarnessStore.getState().setState(s))
  }, [])

  const attachWebview = (el: HTMLElement | null): void => {
    const wv = el as WebviewTagLike | null
    if (!wv) return
    setHarnessWebview(wv)
    const inject = (): void => {
      void wv.insertCSS(HIDE_DSH_SIDEBAR_CSS).catch(() => undefined)
    }
    wv.addEventListener('dom-ready', inject)
    wv.addEventListener('did-navigate', inject)
    inject()
  }

  return (
    <div className="harness-view">
      {state.status === 'ready' && state.url ? (
        <webview
          ref={attachWebview}
          src={state.url}
          className="harness-webview"
          partition="persist:dsh"
          allowpopups={true as never}
        />
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
