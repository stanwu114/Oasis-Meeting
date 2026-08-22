/**
 * 麦克风录音器:MediaRecorder 抓音频,AnalyserNode 提供实时音量用于波形可视化。
 */
export interface RecordingResult {
  blob: Blob
  durationMs: number
}

const LEVEL_BARS = 96 // 可视化保留的柱数
const BAR_INTERVAL = 60 // 每根柱代表的毫秒数

export class MicRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private samples: Uint8Array<ArrayBuffer> | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private stoppedAt = 0
  private levels: number[] = []
  private lastBarAt = 0

  static pickMimeType(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    for (const t of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  async start(): Promise<void> {
    const granted = await window.oasis.system.askMicPermission()
    if (!granted) throw new Error('麦克风权限被拒绝,请在 系统设置 → 隐私与安全性 → 麦克风 中允许 Notion Oasis')

    const mime = MicRecorder.pickMimeType()
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })

    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 128_000 } : undefined)
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(1000)

    // 可视化
    this.audioCtx = new AudioContext()
    const source = this.audioCtx.createMediaStreamSource(this.stream)
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.6
    source.connect(this.analyser)
    this.samples = new Uint8Array(this.analyser.fftSize)

    this.levels = []
    this.lastBarAt = 0
    this.startedAt = performance.now()
    this.stoppedAt = 0
  }

  get elapsedMs(): number {
    return (this.stoppedAt || performance.now()) - this.startedAt
  }

  get mime(): string {
    return this.recorder?.mimeType || this.chunks[0]?.type || 'audio/webm'
  }

  /** 最近 60ms 的音量(0~1) */
  currentLevel(): number {
    if (!this.analyser || !this.samples) return 0
    this.analyser.getByteTimeDomainData(this.samples)
    let sum = 0
    for (let i = 0; i < this.samples.length; i++) {
      const v = (this.samples[i] - 128) / 128
      sum += v * v
    }
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 3.2)
  }

  /** 追加一条柱并返回历史波形(0~1) */
  tickLevels(): number[] {
    const now = performance.now()
    if (now - this.lastBarAt >= BAR_INTERVAL) {
      this.lastBarAt = now
      this.levels.push(this.currentLevel())
      if (this.levels.length > LEVEL_BARS) this.levels.shift()
    }
    return this.levels
  }

  async stop(): Promise<RecordingResult> {
    if (!this.recorder) throw new Error('录音尚未开始')
    this.stoppedAt = performance.now()
    const durationMs = this.elapsedMs

    const stopped = new Promise<void>((resolve) => {
      if (this.recorder!.state === 'inactive') resolve()
      else this.recorder!.addEventListener('stop', () => resolve(), { once: true })
    })
    this.recorder.stop()
    await stopped

    this.release()
    const blob = new Blob(this.chunks, { type: this.mime })
    this.chunks = []
    return { blob, durationMs }
  }

  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      /* noop */
    }
    this.chunks = []
    this.release()
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
    this.analyser = null
    this.samples = null
    this.recorder = null
  }
}
