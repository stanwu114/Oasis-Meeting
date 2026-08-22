import { create } from 'zustand'
import type { RecordingInfo } from '../../../shared/ipc'

interface RecordingsState {
  byId: Record<string, RecordingInfo>
  hydratePage(pageId: string): Promise<void>
  upsert(rec: RecordingInfo): void
}

export const useRecordingsStore = create<RecordingsState>((set) => ({
  byId: {},

  hydratePage: async (pageId) => {
    if (!pageId) return
    const list = await window.oasis.recordings.listByPage(pageId)
    set((s) => {
      const byId = { ...s.byId }
      for (const r of list) byId[r.id] = r
      return { byId }
    })
  },

  upsert: (rec) => {
    set((s) => ({ byId: { ...s.byId, [rec.id]: rec } }))
  }
}))
