import { create } from 'zustand'
import type { HarnessState } from '../../../shared/ipc'

interface HarnessStore {
  state: HarnessState

  init(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  setState(s: HarnessState): void
}

export const useHarnessStore = create<HarnessStore>((set) => ({
  state: { status: 'stopped', url: null, error: null },

  init: async () => {
    const state = await window.oasis.harness.status()
    set({ state })
  },

  start: async () => {
    const state = await window.oasis.harness.start()
    set({ state })
  },

  stop: async () => {
    await window.oasis.harness.stop()
    set({ state: { status: 'stopped', url: null, error: null } })
  },

  setState: (s) => set({ state: s })
}))
