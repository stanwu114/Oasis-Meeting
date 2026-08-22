import { create } from 'zustand'
import type { ModelStatus } from '../../../shared/ipc'

export type Theme = 'light' | 'dark'
export type View = 'editor' | 'recordings' | 'ai' | 'trash'

interface UiState {
  view: View
  searchOpen: boolean
  settingsOpen: boolean
  chatOpen: boolean
  theme: Theme
  language: string
  modelStatus: ModelStatus | null
  toast: string | null
  toastKind: 'info' | 'error'

  setView(v: View): void
  setSearchOpen(open: boolean): void
  setSettingsOpen(open: boolean): void
  setChatOpen(open: boolean): void
  toggleTheme(): void
  setLanguage(lang: string): void
  setModelStatus(m: ModelStatus): void
  initModel(): Promise<void>
  showToast(msg: string, kind?: 'info' | 'error'): void
}

const api = window.oasis

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('oasis.theme', theme)
}

function initialTheme(): Theme {
  const saved = localStorage.getItem('oasis.theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useUiStore = create<UiState>((set, get) => ({
  view: 'editor',
  searchOpen: false,
  settingsOpen: false,
  chatOpen: false,
  theme: initialTheme(),
  language: localStorage.getItem('oasis.language') ?? 'auto',
  modelStatus: null,
  toast: null,
  toastKind: 'info',

  setView: (v) => set({ view: v }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setChatOpen: (open) => set({ chatOpen: open }),

  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },

  setLanguage: (lang) => {
    localStorage.setItem('oasis.language', lang)
    set({ language: lang })
  },

  setModelStatus: (m) => set({ modelStatus: m }),

  initModel: async () => {
    const status = await api.models.status()
    set({ modelStatus: status })
  },

  showToast: (msg, kind = 'info') => {
    set({ toast: msg, toastKind: kind })
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: null })
    }, kind === 'error' ? 5000 : 2600)
  }
}))

// 启动即应用主题,避免闪烁
applyTheme(useUiStore.getState().theme)
