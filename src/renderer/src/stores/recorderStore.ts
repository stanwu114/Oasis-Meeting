import { create } from 'zustand'
import { MicRecorder } from '../audio/MicRecorder'
import { finalizeRecording } from '../audio/pipeline'
import { useUiStore } from './uiStore'

export type RecorderPhase = 'idle' | 'requesting' | 'recording' | 'saving' | 'error'

interface RecorderState {
  phase: RecorderPhase
  error: string | null
  startedAt: number | null

  start(): Promise<void>
  stop(): Promise<void>
  cancel(): void
  setPhase(p: RecorderPhase, error?: string | null): void
}

let recorder: MicRecorder | null = null
let elapsedTimer: number | null = null
let elapsed = 0

export function getElapsed(): number {
  return elapsed
}

export const useRecorderStore = create<RecorderState>((set, get) => ({
  phase: 'idle',
  error: null,
  startedAt: null,

  setPhase: (p, error = null) => set({ phase: p, error }),

  start: async () => {
    if (get().phase === 'recording' || get().phase === 'requesting') return
    set({ phase: 'requesting', error: null })
    recorder = new MicRecorder()
    try {
      await recorder.start()
      elapsed = 0
      set({ phase: 'recording', startedAt: Date.now() })
      elapsedTimer = window.setInterval(() => {
        if (recorder) elapsed = recorder.elapsedMs
      }, 200)
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
      recorder?.cancel()
      recorder = null
    }
  },

  stop: async () => {
    const r = recorder
    if (!r || get().phase !== 'recording') return
    set({ phase: 'saving' })
    if (elapsedTimer) {
      window.clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    try {
      const { blob, durationMs } = await r.stop()
      recorder = null
      await finalizeRecording({ blob, durationMs })
      set({ phase: 'idle', startedAt: null })
    } catch (e) {
      console.error('[recorder] 停止/保存失败:', e)
      recorder?.cancel()
      recorder = null
      const msg = e instanceof Error ? e.message : String(e)
      set({ phase: 'error', error: msg })
      useUiStore.getState().showToast(`录音保存失败:${msg}`, 'error')
    }
  },

  cancel: () => {
    if (elapsedTimer) {
      window.clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    recorder?.cancel()
    recorder = null
    elapsed = 0
    set({ phase: 'idle', error: null, startedAt: null })
  }
}))

/** 供波形组件取当前录音器实例(仅录音中) */
export function activeRecorder(): MicRecorder | null {
  return recorder
}
