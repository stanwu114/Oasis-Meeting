import os from 'node:os'
import sherpaOnnx from 'sherpa-onnx-node'
import { getRecording, setRecordingStatus, setRecordingTranscript } from './db'
import { ensureModelDownloaded, modelFile } from './modelManager'
import { broadcastRecording } from './events'
import type { RecordingInfo } from '../shared/ipc'

/* ---------- sherpa-onnx 引擎封装 ---------- */

interface SenseVoiceModelConfig {
  model: string
  language: string
  useInverseTextNormalization?: boolean
}

interface RecognizerConfig {
  featConfig: { sampleRate: number; featureDim: number }
  modelConfig: {
    senseVoice: SenseVoiceModelConfig
    tokens: string
    numThreads: number
    provider: 'cpu'
    debug: boolean
  }
}

const recognizers = new Map<string, InstanceType<typeof sherpaOnnx.OfflineRecognizer>>()

function getRecognizer(language: string): InstanceType<typeof sherpaOnnx.OfflineRecognizer> {
  const cached = recognizers.get(language)
  if (cached) return cached
  const config: RecognizerConfig = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      senseVoice: {
        model: modelFile('model.int8.onnx'),
        language: language === 'auto' ? 'auto' : language,
        useInverseTextNormalization: true
      },
      tokens: modelFile('tokens.txt'),
      numThreads: Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2))),
      provider: 'cpu',
      debug: false
    }
  }
  const recognizer = new sherpaOnnx.OfflineRecognizer(config as never)
  recognizers.set(language, recognizer)
  return recognizer
}

/* ---------- 能量 VAD 分段(用于切分长音频、生成自然段落) ---------- */

interface Segment {
  start: number // 含
  end: number // 不含
}

function splitLongSegment(pcm: Int16Array, seg: Segment, frameLen: number, rmsAt: (i: number) => number, sampleRate: number): Segment[] {
  const maxLen = Math.round(sampleRate * 30)
  if (seg.end - seg.start <= maxLen) return [seg]
  // 在中段三分之一里找最安静的帧位置切分
  const startFrame = Math.ceil(seg.start / frameLen)
  const endFrame = Math.floor(seg.end / frameLen)
  const cutFrameTarget = startFrame + Math.round((endFrame - startFrame) / 2)
  const window = Math.round(sampleRate * 5 / frameLen)
  let best = cutFrameTarget
  let bestVal = Infinity
  for (let i = Math.max(startFrame + 1, cutFrameTarget - window); i < Math.min(endFrame - 1, cutFrameTarget + window); i++) {
    const v = rmsAt(i)
    if (v < bestVal) {
      bestVal = v
      best = i
    }
  }
  const mid = best * frameLen
  return [
    ...splitLongSegment(pcm, { start: seg.start, end: mid }, frameLen, rmsAt, sampleRate),
    ...splitLongSegment(pcm, { start: mid, end: seg.end }, frameLen, rmsAt, sampleRate)
  ]
}

export function energyVadSegments(pcm: Int16Array, sampleRate: number): Segment[] {
  const frameLen = Math.max(1, Math.round(sampleRate * 0.03))
  const n = Math.floor(pcm.length / frameLen)
  if (n < 4) return [{ start: 0, end: pcm.length }]

  const rms = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < frameLen; j++) {
      const v = pcm[i * frameLen + j] / 32768
      s += v * v
    }
    rms[i] = Math.sqrt(s / frameLen)
  }
  const sorted = Float32Array.from(rms).sort()
  const floor = sorted[Math.floor(n * 0.2)]
  const threshold = Math.max(floor * 3.5, 0.005)
  const exitThreshold = threshold * 0.6

  const enterFrames = 3 // ~90ms 持续有声 → 起始
  const exitFrames = Math.max(8, Math.round(0.75 / 0.03)) // ~750ms 持续安静 → 结束

  const raw: Segment[] = []
  let inSpeech = false
  let above = 0
  let below = 0
  let segStart = 0
  for (let i = 0; i < n; i++) {
    if (rms[i] > threshold) {
      above++
      below = 0
    } else if (rms[i] < exitThreshold) {
      below++
      above = 0
    }
    if (!inSpeech && above >= enterFrames) {
      inSpeech = true
      segStart = Math.max(0, i - enterFrames + 1) * frameLen
    }
    if (inSpeech && below >= exitFrames) {
      raw.push({ start: segStart, end: Math.max(segStart, (i - exitFrames + 1) * frameLen) })
      inSpeech = false
    }
  }
  if (inSpeech) raw.push({ start: segStart, end: pcm.length })
  if (raw.length === 0) return [{ start: 0, end: pcm.length }]

  // 丢弃过短段、合并小间隙
  const minSeg = Math.round(sampleRate * 0.12)
  const maxGap = Math.round(sampleRate * 0.4)
  const cleaned: Segment[] = []
  for (const seg of raw) {
    if (seg.end - seg.start < minSeg) continue
    const last = cleaned[cleaned.length - 1]
    if (last && seg.start - last.end < maxGap) last.end = seg.end
    else cleaned.push({ ...seg })
  }

  // 超长段在静音处切开
  const split: Segment[] = []
  for (const seg of cleaned) split.push(...splitLongSegment(pcm, seg, frameLen, (i) => rms[i] ?? 0, sampleRate))
  return split
}

/* ---------- 转写 ---------- */

function cleanText(t: string): string {
  return t
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

export function recognizePcm(pcm: Int16Array, sampleRate: number, language: string): string {
  const recognizer = getRecognizer(language)
  const segments = energyVadSegments(pcm, sampleRate)
  const lines: string[] = []
  const samples = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768

  for (const seg of segments) {
    const stream = recognizer.createStream()
    stream.acceptWaveform({ sampleRate, samples: samples.subarray(seg.start, seg.end) })
    recognizer.decode(stream)
    const result = recognizer.getResult(stream) as { text?: string }
    const text = cleanText(result?.text ?? '')
    if (text) lines.push(`[${formatStamp(Math.round((seg.start / sampleRate) * 1000))}] ${text}`)
  }
  return lines.join('\n\n')
}

/** 段落时间戳:mm:ss,超过一小时为 h:mm:ss */
export function formatStamp(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

/* ---------- 串行任务队列 ---------- */

interface Job {
  recordingId: string
  pcm: Int16Array
  sampleRate: number
  language: string
}

const queue: Job[] = []
let running = false

function emit(rec: RecordingInfo | null): void {
  if (rec) broadcastRecording(rec)
}

async function processQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()!
      try {
        const rec = getRecording(job.recordingId)
        if (!rec) continue

        // 模型未就绪时先广播下载状态
        const modelReady = await ensureModelDownloadedQuiet()
        if (!modelReady.ok) {
          setRecordingStatus(job.recordingId, 'error', modelReady.error ?? '模型下载失败')
          emit(getRecording(job.recordingId))
          continue
        }

        setRecordingStatus(job.recordingId, 'transcribing')
        emit(getRecording(job.recordingId))

        const text = recognizePcm(job.pcm, job.sampleRate, job.language)
        setRecordingTranscript(job.recordingId, text, job.language)
        emit(getRecording(job.recordingId))
        // AI 纪要为独立功能,由用户在纪要页手动触发生成
      } catch (e) {
        setRecordingStatus(job.recordingId, 'error', e instanceof Error ? e.message : String(e))
        emit(getRecording(job.recordingId))
      }
    }
  } finally {
    running = false
  }
}

async function ensureModelDownloadedQuiet(): Promise<{ ok: boolean; error?: string }> {
  try {
    const status = await ensureModelDownloaded()
    return { ok: status.downloaded, error: status.error ?? undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 提交转写任务;状态变化通过 recordingsChanged 事件广播 */
export function enqueueTranscription(input: {
  recordingId: string
  pcm: Int16Array
  sampleRate: number
  language: string
}): void {
  queue.push(input)
  setRecordingStatus(input.recordingId, 'pending')
  emit(getRecording(input.recordingId))
  void processQueue()
}

/** 引擎自检(设置页/启动诊断用) */
export function engineAvailable(): boolean {
  try {
    getRecognizer('auto')
    return true
  } catch (e) {
    console.error('[transcriber] 引擎初始化失败:', e)
    return false
  }
}
