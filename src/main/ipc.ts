import { app, ipcMain, systemPreferences, dialog, shell } from 'electron'
import { IPC } from '../shared/ipc'
import type { BlockDoc, ImportedAudio, SaveRecordingInput } from '../shared/ipc'
import * as db from './db'
import * as media from './media'
import { getModelStatus, ensureModelDownloaded } from './modelManager'
import { enqueueTranscription } from './transcriber'
import { enqueueSummary } from './summarizer'
import { chat, runEditorAction, meetingName } from './llm'
import { getLlmConfigState, setLlmConfig, testLlmConnection } from './llmSettings'
import { getDataLocation, chooseDataLocation, migrateDataLocation, resetDataLocation } from './dataLocation'
import { extractDocText } from '../shared/extract'
import { exportMeetingToWord } from './exportMeeting'

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
  handle(IPC.pagesMergeConsole, (id: string, patch: Record<string, unknown>) => {
    db.mergeConsoleFields(id, patch)
  })
  handle(IPC.pagesUpdateConsole, (id: string, fields: { transcript?: string; summary?: string; notes?: string }) => {
    db.updateConsoleFields(id, fields)
  })
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

  /* ---------- AI 编辑器动作 ---------- */
  handle(IPC.meetingExport, async (data: import('../shared/ipc').ExportMeetingData) => {
    return exportMeetingToWord(data)
  })
  handle(IPC.aiMeetingName, (transcript: string) => meetingName(transcript))
  handle(
    IPC.aiEditorAction,
    (
      action: 'summarize' | 'polish' | 'proofread' | 'explain' | 'translate' | 'continue' | 'ask',
      text: string,
      question?: string
    ) => runEditorAction(action, text, question)
  )
  handle(IPC.aiSummarizePage, async (pageId: string) => {
    const page = db.getPage(pageId)
    if (!page) throw new Error('页面不存在')
    const body = (page.content ? extractDocText(page.content) : '').trim()
    if (!body) throw new Error('本页还没有内容')
    return chat(
      [
        {
          role: 'system',
          content: `你是笔记助手。把用户提供的笔记总结为中文摘要,严格按以下 Markdown 结构输出:

## 摘要
(2~3 句话概括)

## 要点
- (3~6 条要点,保留关键信息)

只输出摘要本身,不要前言或解释。`
        },
        { role: 'user', content: body.slice(0, 24_000) }
      ],
      { temperature: 0.3 }
    )
  })

  /* ---------- AI 大模型接口 ---------- */
  handle(IPC.llmConfigGet, () => getLlmConfigState())
  handle(IPC.llmConfigSet, (patch: { apiKey?: string; baseUrl?: string; model?: string }) => {
    setLlmConfig(patch)
    return getLlmConfigState()
  })
  handle(IPC.llmTest, () => testLlmConnection())

  /* 数据位置管理 */
  handle(IPC.dataGetLocation, () => getDataLocation())
  handle(IPC.dataChooseLocation, () => chooseDataLocation())
  handle(IPC.dataMigrateLocation, (path: string) => migrateDataLocation(path, () => undefined))
  handle(IPC.dataResetLocation, () => resetDataLocation())

  /* 转写引擎检测 */
  handle(IPC.engineCheck, async () => {
    try {
      const { engineAvailable } = await import('./transcriber')
      const ok = await engineAvailable()
      return ok
        ? { ok: true, message: '引擎正常,模型可加载' }
        : { ok: false, message: '引擎无法加载模型,请重新下载' }
    } catch (e) {
      return { ok: false, message: `检测失败: ${e instanceof Error ? e.message : String(e)}` }
    }
  })

  /* ---------- 搜索 ---------- */
  handle(IPC.searchQuery, (q: string) => db.searchPages(q.trim()))

  /* ---------- 系统 ---------- */
  handle(IPC.systemAskMic, async () => {
    const appName = app.isPackaged ? 'Oasis Meeting' : 'Electron'
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
  handle(IPC.systemCityLocation, async () => {
    try {
      const res = await fetch('http://ip-api.com/json/?lang=zh-CN', { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return null
      const data = (await res.json()) as { city?: string; regionName?: string; country?: string }
      if (!data.city && !data.regionName) return null
      return { city: data.city ?? '', region: data.regionName ?? '', country: data.country ?? '' }
    } catch {
      return null
    }
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
