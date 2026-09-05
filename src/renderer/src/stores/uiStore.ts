import { create } from 'zustand'
import type { ModelStatus, SearchResult } from '../../../shared/ipc'

export type Theme = 'light' | 'dark'
export type View = 'editor' | 'trash' | 'settings'

interface UiState {
  view: View
  searchOpen: boolean
  theme: Theme
  language: string
  modelStatus: ModelStatus | null
  toast: string | null
  toastKind: 'info' | 'error'
  searchQuery: string
  searchResults: SearchResult[]
  highlightQuery: string

  setView(v: View): void
  setSearch(q: string, results: SearchResult[]): void
  setHighlightQuery(q: string): void
  setSearchOpen(open: boolean): void
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
  theme: initialTheme(),
  language: localStorage.getItem('oasis.language') ?? 'auto',
  modelStatus: null,
  toast: null,
  toastKind: 'info',
  searchQuery: '',
  searchResults: [],
  highlightQuery: '',

  setView: (v) => set({ view: v }),
  setSearch: (q: string, results: SearchResult[]) => set({ searchQuery: q, searchResults: results }),
  setHighlightQuery: (q: string) => set({ highlightQuery: q }),

  setSearchOpen: (open) => set({ searchOpen: open }),

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
