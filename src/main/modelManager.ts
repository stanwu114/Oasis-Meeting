import { app } from 'electron'
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC, type ModelFileProgress, type ModelStatus } from '../shared/ipc'

/**
 * SenseVoice Small(zh/en/ja/ko/yue)模型,来自 sherpa-onnx 官方发布。
 * int8 量化版约 237MB,识别速度远超实时,CPU 即可流畅运行。
 */
const HF_BASE =
  'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main'

const FILES: { name: string; url: string; minBytes: number }[] = [
  { name: 'model.int8.onnx', url: `${HF_BASE}/model.int8.onnx`, minBytes: 200 * 1024 * 1024 },
  { name: 'tokens.txt', url: `${HF_BASE}/tokens.txt`, minBytes: 1000 }
]

export function modelDir(): string {
  return join(app.getPath('userData'), 'models', 'sensevoice')
}
export const modelFile = (name: string) => join(modelDir(), name)

let state: ModelStatus = {
  downloaded: false,
  downloading: false,
  files: [],
  error: null
}
let downloadPromise: Promise<void> | null = null
let listeners: ((m: ModelStatus) => void)[] = []

/** 校验本地文件是否完整 */
async function checkDownloaded(): Promise<boolean> {
  const { stat } = await import('node:fs/promises')
  for (const f of FILES) {
    try {
      const s = await stat(modelFile(f.name))
      if (!s.isFile() || s.size < f.minBytes) return false
    } catch {
      return false
    }
  }
  return true
}

function setState(patch: Partial<ModelStatus>): void {
  state = { ...state, ...patch }
  for (const fn of listeners) fn(state)
}

export function onModelStatus(fn: (m: ModelStatus) => void): void {
  listeners.push(fn)
}

export async function getModelStatus(): Promise<ModelStatus> {
  if (!state.downloaded && !state.downloading) {
    const ok = await checkDownloaded()
    if (ok) setState({ downloaded: true })
    else {
      const { stat } = await import('node:fs/promises')
      state = {
        ...state,
        files: await Promise.all(
          FILES.map(async (f) => {
            try {
              const s = await stat(modelFile(f.name))
              return { name: f.name, downloadedBytes: s.size, totalBytes: f.minBytes }
            } catch {
              return { name: f.name, downloadedBytes: 0, totalBytes: null }
            }
          })
        )
      }
    }
  }
  return state
}

async function downloadFile(f: { name: string; url: string; minBytes: number }): Promise<void> {
  const res = await fetch(f.url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`下载 ${f.name} 失败:HTTP ${res.status}`)
  const totalBytes = Number(res.headers.get('content-length')) || null
  let received = 0
  let lastNotify = 0

  const part = modelFile(`${f.name}.part`)
  const ws = createWriteStream(part)
  const progress: ModelFileProgress = { name: f.name, downloadedBytes: 0, totalBytes }
  const files = state.files.some((x) => x.name === f.name)
    ? state.files.map((x) => (x.name === f.name ? progress : x))
    : [...state.files, progress]

  const notify = (force = false) => {
    const now = Date.now()
    if (force || now - lastNotify > 200) {
      lastNotify = now
      progress.downloadedBytes = received
      setState({ files: [...files] })
    }
  }

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    received += chunk.byteLength
    if (ws.write(chunk) === false) {
      await new Promise<void>((r) => ws.once('drain', () => r()))
    }
    notify()
  }
  await new Promise<void>((r) => ws.end(r))
  notify(true)

  if (received < f.minBytes) {
    await rm(part, { force: true })
    throw new Error(`${f.name} 下载不完整(${received} 字节)`)
  }
  await rename(part, modelFile(f.name))
}

async function downloadAll(): Promise<void> {
  setState({ downloading: true, error: null })
  try {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(modelDir(), { recursive: true })
    for (const f of FILES) {
      const alreadyOk = await (async () => {
        try {
          const { stat } = await import('node:fs/promises')
          const s = await stat(modelFile(f.name))
          return s.size >= f.minBytes
        } catch {
          return false
        }
      })()
      if (alreadyOk) continue
      await downloadFile(f)
    }
    setState({ downloaded: true, downloading: false })
  } catch (e) {
    setState({ downloading: false, error: e instanceof Error ? e.message : String(e) })
    throw e
  } finally {
    downloadPromise = null
  }
}

/** 确保模型已下载;未下载则开始(单飞),通过 onModelStatus 收进度 */
export async function ensureModelDownloaded(): Promise<ModelStatus> {
  if (state.downloaded) return state
  if (!downloadPromise) downloadPromise = downloadAll().catch(() => {})
  await downloadPromise
  return state
}

export const MODEL_FILES = FILES
export const EVT_MODEL_PROGRESS = IPC.evtModelProgress
