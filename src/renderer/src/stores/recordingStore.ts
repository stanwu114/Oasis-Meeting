import { create } from 'zustand'
import { MicRecorder } from '../audio/MicRecorder'
import { decodeToPcm16kMono } from '../audio/pcm'
import fixWebmDuration from 'fix-webm-duration'

/**
 * 全局录音管理器:录音器独立于页面组件存活。
 * 录音/导入/转写/纪要期间随意切换页面或视图,任务不中断,
 * 结果经 IPC 直接落回目标会议(mergeConsole),页面重新打开时可见。
 */

export type RecPhase = 'recording' | 'paused' | 'importing' | 'transcribing' | 'summarizing' | 'error' | 'done'

interface RecordingState {
  /** null = 空闲 */
  phase: RecPhase | null
  /** 目标会议页面 id */
  pageId: string | null
  pageTitle: string
  elapsedMs: number
  errorMsg: string

  start(pageId: string, pageTitle: string): Promise<void>
  togglePause(): void
  stop(): Promise<void>
  /** 导入音频文件走同一条全局流水线 */
  importBlob(pageId: string, pageTitle: string, blob: Blob): Promise<void>
  getRecorder(): MicRecorder | null
  /** done/error → 空闲 */
  reset(): void
}

/** 模块级实例(非序列化,不入 store state) */
let recorder: MicRecorder | null = null
let timer: number | null = null

function startTimerFx(): void {
  if (timer) return
  timer = window.setInterval(() => {
    if (recorder) useRecordingStore.setState({ elapsedMs: recorder.elapsedMs })
  }, 200)
}

function stopTimerFx(): void {
  if (timer) {
    window.clearInterval(timer)
    timer = null
  }
}

const busyPhases: RecPhase[] = ['recording', 'paused', 'importing', 'transcribing', 'summarizing']

/** 完整流水线:修复时长 → 存录音 → 转写 → 纪要,全部经 IPC 落库 */
async function runPipeline(pageId: string, blob: Blob, durationMs: number): Promise<void> {
  console.info(`[rec] 流水线开始:页面=${pageId} 时长=${Math.round(durationMs / 1000)}s`)
  let fixed = blob
  if (blob.type.includes('webm') && durationMs > 0) {
    try {
      fixed = await fixWebmDuration(blob, durationMs)
    } catch {
      /* 保持原样 */
    }
  }
  const { pcm } = await decodeToPcm16kMono(fixed)
  const buffer = await fixed.arrayBuffer()
  const recInfo = await window.oasis.recordings.save({
    pageId,
    mimeType: fixed.type || 'audio/webm',
    durationMs,
    buffer
  })
  void window.oasis.pages.mergeConsole(pageId, { durationMs, recordingId: recInfo.id, status: 'transcribing' })
  useRecordingStore.setState({ phase: 'transcribing' })

  const lang = localStorage.getItem('oasis.language') || 'auto'
  // 超时按时长放宽:本地转写长音频需要几分钟(2 小时音频 ≈ 2 分钟)
  const timeoutMs = Math.min(600_000, Math.max(90_000, Math.round(durationMs / 4) + 60_000))
  const transcript = await new Promise<string>((resolve) => {
    const unsub = window.oasis.on.recordingsChanged((r) => {
      if (r.id === recInfo.id && r.status === 'done') { unsub(); resolve(r.transcript || '') }
      if (r.id === recInfo.id && r.status === 'error') { unsub(); resolve(r.transcript || '') }
    })
    void window.oasis.recordings.transcribe(recInfo.id, pcm, 16000, lang)
    setTimeout(() => { unsub(); resolve('') }, timeoutMs)
  })

  console.info(`[rec] 转写完成:${transcript.length} 字`)
  if (!transcript) {
    void window.oasis.pages.mergeConsole(pageId, { status: 'error' })
    useRecordingStore.setState({ phase: 'error', errorMsg: '转写结果为空(录音太短或引擎出错)' })
    return
  }

  void window.oasis.pages.mergeConsole(pageId, { transcript, status: 'summarizing' })
  useRecordingStore.setState({ phase: 'summarizing' })
  const summary = await new Promise<string>((resolve) => {
    const unsub = window.oasis.on.recordingsChanged((r) => {
      if (r.id === recInfo.id && r.summaryStatus === 'done') { unsub(); resolve(r.summary || '') }
      if (r.id === recInfo.id && r.summaryStatus === 'error') { unsub(); resolve('') }
    })
    void window.oasis.recordings.summarize(recInfo.id)
  })
  void window.oasis.pages.mergeConsole(pageId, { summary, status: 'done' })
  console.info('[rec] 纪要完成,流水线结束')
  useRecordingStore.setState({ phase: 'done' })
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  phase: null,
  pageId: null,
  pageTitle: '',
  elapsedMs: 0,
  errorMsg: '',
  start: async (pageId, pageTitle) => {
    const cur = get().phase
    if (cur && busyPhases.includes(cur)) throw new Error('已有进行中的录音任务,请先停止')
    const granted = await window.oasis.system.askMicPermission()
    if (!granted) throw new Error('麦克风权限被拒绝')
    const rec = new MicRecorder()
    await rec.start()
    recorder = rec
    set({ phase: 'recording', pageId, pageTitle, elapsedMs: 0, errorMsg: '' })
    startTimerFx()
  },

  togglePause: () => {
    if (!recorder) return
    if (get().phase === 'recording') {
      recorder.pause()
      set({ phase: 'paused' })
    } else if (get().phase === 'paused') {
      recorder.resume()
      set({ phase: 'recording' })
    }
  },

  stop: async () => {
    const rec = recorder
    const pageId = get().pageId
    if (!rec || !pageId) return
    recorder = null
    stopTimerFx()
    try {
      const { blob, durationMs } = await rec.stop()
      await runPipeline(pageId, blob, durationMs)
    } catch (e) {
      rec.cancel()
      void window.oasis.pages.mergeConsole(pageId, { status: 'error' }).catch(() => undefined)
      set({ phase: 'error', errorMsg: e instanceof Error ? e.message : String(e) })
    }
  },

  importBlob: async (pageId, pageTitle, blob) => {
    const cur = get().phase
    if (cur && busyPhases.includes(cur)) throw new Error('已有进行中的录音任务,请先等待完成')
    set({ phase: 'importing', pageId, pageTitle, elapsedMs: 0, errorMsg: '' })
    try {
      const { durationMs } = await decodeToPcm16kMono(blob)
      await runPipeline(pageId, blob, durationMs)
    } catch (e) {
      set({ phase: 'error', errorMsg: e instanceof Error ? e.message : String(e) })
    }
  },

  getRecorder: () => recorder,

  reset: () => {
    if (get().phase === 'done' || get().phase === 'error') {
      set({ phase: null, pageId: null, pageTitle: '', errorMsg: '' })
    }
  }
}))

/* 开发期自检:重复 store 实例会导致侧边栏与页面状态分裂(如录音显示矛盾) */
declare global {
  // eslint-disable-next-line no-var
  var __oasisRecStore: unknown
}
if (window.__oasisRecStore !== undefined) {
  console.error('[recordingStore] 检测到重复实例!侧边栏与页面状态可能分裂,请刷新页面(Cmd+R)')
} else {
  window.__oasisRecStore = useRecordingStore
}
