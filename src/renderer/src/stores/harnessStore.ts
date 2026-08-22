import { create } from 'zustand'
import type { HarnessSession, HarnessState } from '../../../shared/ipc'

interface HarnessStore {
  state: HarnessState
  sessions: HarnessSession[]
  sessionsLoading: boolean

  init(): Promise<void>
  start(): Promise<void>
  refreshSessions(): Promise<void>
  setState(s: HarnessState): void
}

export const useHarnessStore = create<HarnessStore>((set) => ({
  state: { status: 'stopped', url: null, error: null },
  sessions: [],
  sessionsLoading: false,

  init: async () => {
    const state = await window.oasis.harness.status()
    set({ state })
    await Promise.all([useHarnessStore.getState().refreshSessions()])
  },

  start: async () => {
    const state = await window.oasis.harness.start()
    set({ state })
  },

  refreshSessions: async () => {
    set({ sessionsLoading: true })
    try {
      const sessions = await window.oasis.harness.sessions()
      set({ sessions })
    } finally {
      set({ sessionsLoading: false })
    }
  },

  setState: (s) => set({ state: s })
}))
