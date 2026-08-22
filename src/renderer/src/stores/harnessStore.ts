import { create } from 'zustand'
import type { HarnessSession, HarnessState } from '../../../shared/ipc'

interface HarnessStore {
  state: HarnessState
  sessions: HarnessSession[]
  sessionsLoading: boolean
  activeSessionTitle: string | null

  init(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  setState(s: HarnessState): void
  refreshSessions(): Promise<void>
  setActiveSession(title: string | null): void
  /** 在 webview 中打开指定历史会话(按标题匹配点击 dsh 内部条目) */
  openSession(session: HarnessSession): void
  /** 在 webview 中触发「新建会话」 */
  newSession(): void
}

type WebviewLike = {
  executeJavaScript(code: string): Promise<unknown>
  insertCSS(css: string): Promise<string>
} | null

let webview: WebviewLike = null

/** HarnessView 挂载 webview 后注册 */
export function setHarnessWebview(el: WebviewLike): void {
  webview = el
}

const OPEN_SESSION_JS = (title: string): string => `(function(){
  var wanted = ${JSON.stringify(title)}
  var list = document.querySelector('[class*="list"]') || document.body
  var nodes = list.querySelectorAll('button, [role="button"], a, div[class*="item"], div[class*="session"]')
  for (var i = 0; i < nodes.length; i++) {
    var t = (nodes[i].textContent || '').trim()
    if (t && t.startsWith(wanted)) {
      // 优先点击最内层匹配元素,避免误点父容器
      var el = nodes[i]
      for (var j = 0; j < nodes.length; j++) {
        var t2 = (nodes[j].textContent || '').trim()
        if (t2.startsWith(wanted) && nodes[j] !== el && el.contains(nodes[j])) el = nodes[j]
      }
      el.click()
      return true
    }
  }
  return false
})()`

const NEW_SESSION_JS = `(function(){
  var btn = document.querySelector('button[aria-label="新建会话"]') ||
    document.querySelector('button[aria-label="New session"]') ||
    document.querySelector('[class*="newSession"]')
  if (btn) { btn.click(); return true }
  return false
})()`

export const useHarnessStore = create<HarnessStore>((set, get) => ({
  state: { status: 'stopped', url: null, error: null },
  sessions: [],
  sessionsLoading: false,
  activeSessionTitle: null,

  init: async () => {
    const state = await window.oasis.harness.status()
    set({ state })
    await get().refreshSessions()
  },

  start: async () => {
    const state = await window.oasis.harness.start()
    set({ state })
  },

  stop: async () => {
    await window.oasis.harness.stop()
    set({ state: { status: 'stopped', url: null, error: null } })
  },

  setState: (s) => set({ state: s }),

  refreshSessions: async () => {
    set({ sessionsLoading: true })
    try {
      const sessions = await window.oasis.harness.sessions()
      set({ sessions })
    } finally {
      set({ sessionsLoading: false })
    }
  },

  setActiveSession: (title) => set({ activeSessionTitle: title }),

  openSession: (session) => {
    set({ activeSessionTitle: session.title })
    if (!webview) return
    void webview.executeJavaScript(OPEN_SESSION_JS(session.title)).catch(() => undefined)
  },

  newSession: () => {
    set({ activeSessionTitle: null })
    if (!webview) return
    void webview.executeJavaScript(NEW_SESSION_JS).catch(() => undefined)
  }
}))
