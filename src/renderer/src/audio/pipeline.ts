import fixWebmDuration from 'fix-webm-duration'
import { decodeToPcm16kMono } from './pcm'
import { insertRecordingBlock, getEditor } from '../editor/bridge'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { useRecordingsStore } from '../stores/recordingsStore'
import type { RecordingInfo } from '../../../shared/ipc'

/**
 * 录音/导入音频 → 存盘 → 插入录音块 → 提交本地转写。
 * 转写进度通过 recordingsChanged 事件回流 UI。
 */
export async function finalizeRecording(input: {
  blob: Blob
  durationMs: number
  pageTitleForNewPage?: string
}): Promise<RecordingInfo> {
  const app = useAppStore.getState()
  const ui = useUiStore.getState()

  // 1. webm 补时长元数据(否则播放器无法 seek)
  let blob = input.blob
  if (blob.type.includes('webm') && input.durationMs > 0) {
    try {
      blob = await fixWebmDuration(blob, input.durationMs)
    } catch (e) {
      console.warn('[pipeline] fix-webm-duration 失败(忽略):', e)
    }
  }

  // 2. 解码为 16k 单声道 PCM(纯本地,Chromium 解码器)
  const { pcm, durationMs } = await decodeToPcm16kMono(blob)

  // 3. 确定目标页面(必要时新建并打开,等待编辑器就绪)
  let pageId = app.currentId
  if (!pageId) {
    pageId = await useAppStore.getState().createPage(null, input.pageTitleForNewPage ?? newRecordingTitle())
  }
  await waitEditorReady()

  // 4. 存盘 + 插入块
  const rec = await window.oasis.recordings.save({
    pageId,
    mimeType: blob.type || 'audio/webm',
    durationMs: durationMs || input.durationMs,
    buffer: await blob.arrayBuffer()
  })
  useRecordingsStore.getState().upsert(rec)
  insertRecordingBlock(rec)

  // 5. 提交转写(异步,事件驱动 UI)
  await window.oasis.recordings.transcribe(rec.id, pcm, 16000, ui.language)
  return rec
}

/** 从已存在的录音文件重新转写 */
export async function retranscribe(rec: RecordingInfo): Promise<void> {
  const ui = useUiStore.getState()
  const buf = await window.oasis.recordings.readAudio(rec.id)
  if (!buf) throw new Error('音频文件缺失')
  const { pcm } = await decodeToPcm16kMono(new Blob([buf], { type: rec.mimeType }))
  await window.oasis.recordings.transcribe(rec.id, pcm, 16000, ui.language)
}

/** 导入本地音频文件并转写 */
export async function importAudioAndTranscribe(): Promise<void> {
  const ui = useUiStore.getState()
  const imported = await window.oasis.system.importAudioFile()
  if (!imported) return
  const blob = new Blob([imported.buffer], { type: imported.mimeType })
  await finalizeRecording({ blob, durationMs: 0, pageTitleForNewPage: `转写:${imported.fileName}` })
  ui.showToast(`已导入 ${imported.fileName},开始本地转写`)
}

async function waitEditorReady(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (getEditor()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('编辑器未就绪,无法插入录音块')
}

function newRecordingTitle(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `录音 ${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
