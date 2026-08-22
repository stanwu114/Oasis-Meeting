import { app, ipcMain, systemPreferences, dialog, shell } from 'electron'
import { IPC } from '../shared/ipc'
import type { BlockDoc, ImportedAudio, SaveRecordingInput } from '../shared/ipc'
import * as db from './db'
import * as media from './media'
import { getModelStatus, ensureModelDownloaded } from './modelManager'
import { enqueueTranscription } from './transcriber'
import { startDsh, stopDsh, getDshState } from './dshRunner'
import { enqueueSummary } from './summarizer'

/** 包装 handler:统一异常日志与向渲染进程抛错 */
function handle<T extends unknown[]>(channel: string, fn: (...args: T) => unknown): void {
  ipcMain.handle(channel, (_event, ...args: T) => {
    try {
      return fn(...args)
    } catch (e) {
      console.error(`[ipc:${channel}]`, e)
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
}

export function registerIpc(): void {
  /* ---------- 页面 ---------- */
  handle(IPC.pagesList, () => db.listPages())
  handle(IPC.pagesGet, (id: string) => db.getPage(id))
  handle(IPC.pagesCreate, (parentId: string | null, title?: string) => db.createPage(parentId, title))
  handle(IPC.pagesRename, (id: string, title: string) => db.renamePage(id, title))
  handle(IPC.pagesSetIcon, (id: string, icon: string | null) => db.setIcon(id, icon))
  handle(IPC.pagesMove, (id: string, parentId: string | null, index: number) => db.movePage(id, parentId, index))
  handle(IPC.pagesUpdateContent, (id: string, content: BlockDoc) => db.updateContent(id, content))
  handle(IPC.pagesTrash, (id: string) => db.trashPage(id))
  handle(IPC.pagesRestore, (id: string) => db.restorePage(id))
  handle(IPC.pagesDeletePermanent, async (id: string) => {
    const files = db.deletePagePermanent(id)
    for (const f of files) await media.deleteAudioFile(f)
  })
  handle(IPC.pagesTrashList, () => db.listTrash())

  /* ---------- 录音 ---------- */
  handle(IPC.recordingsSave, async (input: SaveRecordingInput) => {
    const fileName = await media.saveAudioFile(input.buffer, input.mimeType)
    return db.createRecording({
      pageId: input.pageId,
      fileName,
      mimeType: media.normalizeMime(input.mimeType),
      durationMs: input.durationMs,
      language: 'auto'
    })
  })
  handle(IPC.recordingsGet, (id: string) => db.getRecording(id))
  handle(IPC.recordingsListByPage, (pageId: string) => db.listRecordingsByPage(pageId))
  handle(IPC.recordingsListAll, () => db.listAllRecordings())
  handle(IPC.recordingsReadAudio, async (id: string): Promise<ArrayBuffer | null> => {
    const rec = db.getRecording(id)
    if (!rec) return null
    const bytes = await media.readAudioBytes(rec.fileName)
    if (!bytes) return null
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  })
  handle(IPC.recordingsUpdateBlock, (id: string, blockId: string | null) => db.setRecordingBlock(id, blockId))
  handle(IPC.recordingsTranscribe, (id: string, pcm: Int16Array, sampleRate: number, language: string) => {
    enqueueTranscription({ recordingId: id, pcm, sampleRate, language })
  })
  handle(IPC.recordingsSummarize, (id: string) => {
    enqueueSummary(id)
  })

  /* ---------- 模型 ---------- */
  handle(IPC.modelsStatus, () => getModelStatus())
  handle(IPC.modelsEnsure, () => ensureModelDownloaded())

  /* ---------- AI 面板(dsh) ---------- */
  handle(IPC.aiStart, () => startDsh())
  handle(IPC.aiStop, () => {
    stopDsh()
  })
  handle(IPC.aiStatus, () => getDshState())

  /* ---------- 搜索 ---------- */
  handle(IPC.searchQuery, (q: string) => db.searchPages(q.trim()))

  /* ---------- 系统 ---------- */
  handle(IPC.systemAskMic, async () => {
    const appName = app.isPackaged ? 'Notion Oasis' : 'Electron'
    if (process.platform !== 'darwin') return { granted: true, appName }
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return { granted, appName }
    } catch (e) {
      console.error('[mic-permission]', e)
      return { granted: false, appName }
    }
  })
  handle(IPC.systemOpenExternal, async (url: string) => {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
  })
  handle(IPC.systemImportAudio, async (): Promise<ImportedAudio | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入音频文件',
      properties: ['openFile'],
      filters: [{ name: '音频文件', extensions: ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'flac', 'aac', 'opus'] }]
    })
    if (canceled || filePaths.length === 0) return null
    const { readFile } = await import('node:fs/promises')
    const { basename, extname } = await import('node:path')
    const file = filePaths[0]
    const buffer = await readFile(file)
    const ext = extname(file).toLowerCase().replace('.', '')
    const mime =
      (
        {
          mp3: 'audio/mpeg',
          m4a: 'audio/mp4',
          wav: 'audio/wav',
          webm: 'audio/webm',
          ogg: 'audio/ogg',
          opus: 'audio/ogg',
          flac: 'audio/flac',
          aac: 'audio/aac'
        } as Record<string, string>
      )[ext] ?? 'audio/mpeg'
    return { fileName: basename(file), mimeType: mime, buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer }
  })
}
