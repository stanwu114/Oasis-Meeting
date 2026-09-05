/** IPC 通道名与前后端数据契约(main / preload / renderer 共用) */

export const IPC = {
  pagesList: 'pages:list',
  pagesGet: 'pages:get',
  pagesCreate: 'pages:create',
  pagesRename: 'pages:rename',
  pagesSetIcon: 'pages:set-icon',
  pagesMove: 'pages:move',
  pagesUpdateContent: 'pages:update-content',
  pagesUpdateConsole: 'pages:update-console',
  pagesMergeConsole: 'pages:merge-console',
  pagesTrash: 'pages:trash',
  pagesRestore: 'pages:restore',
  pagesDeletePermanent: 'pages:delete-permanent',
  pagesTrashList: 'pages:trash-list',

  recordingsSave: 'recordings:save',
  recordingsGet: 'recordings:get',
  recordingsListByPage: 'recordings:list-by-page',
  recordingsListAll: 'recordings:list-all',
  recordingsReadAudio: 'recordings:read-audio',
  recordingsUpdateBlock: 'recordings:update-block',
  recordingsTranscribe: 'recordings:transcribe',
  recordingsSummarize: 'recordings:summarize',

  modelsStatus: 'models:status',
  modelsEnsure: 'models:ensure',

  searchQuery: 'search:query',

  systemAskMic: 'system:ask-mic',
  systemImportAudio: 'system:import-audio',
  systemOpenExternal: 'system:open-external',
  systemCityLocation: 'system:city-location',

  aiMeetingName: 'ai:meeting-name',
  meetingExport: 'meeting:export',

  aiEditorAction: 'ai:editor-action',
  aiSummarizePage: 'ai:summarize-page',

  llmConfigGet: 'llm:config-get',
  llmConfigSet: 'llm:config-set',
  llmTest: 'llm:test',

  dataGetLocation: 'data:get-location',
  dataChooseLocation: 'data:choose-location',
  dataMigrateLocation: 'data:migrate-location',
  dataResetLocation: 'data:reset-location',
  engineCheck: 'engine:check',

  evtRecordingsChanged: 'evt:recordings-changed',
  evtModelProgress: 'evt:model-progress'
} as const

export interface PageSummary {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  childCount: number
  deletedAt?: string | null
}

export type BlockDoc = unknown[]

export interface PageDetail extends PageSummary {
  content: BlockDoc | null
}

export type TranscribeStatus =
  | 'pending'
  | 'downloading-model'
  | 'transcribing'
  | 'done'
  | 'error'

export type SummaryStatus = 'pending' | 'summarizing' | 'done' | 'error'

export interface RecordingInfo {
  id: string
  pageId: string
  blockId: string | null
  fileName: string
  mimeType: string
  durationMs: number
  transcript: string | null
  summary: string | null
  summaryStatus: SummaryStatus
  summaryError: string | null
  language: string
  engine: string
  status: TranscribeStatus
  error: string | null
  createdAt: string
}

/** 录音列表条目(跨页面,用于「录音」视图) */
export interface RecordingListEntry {  id: string
  pageId: string
  pageTitle: string
  durationMs: number
  status: TranscribeStatus
  error: string | null
  transcriptPreview: string
  createdAt: string
}

export interface ModelFileProgress {
  name: string
  downloadedBytes: number
  totalBytes: number | null
}

export interface ModelStatus {
  downloaded: boolean
  downloading: boolean
  files: ModelFileProgress[]
  error: string | null
}

export interface SearchResult {
  pageId: string
  title: string
  icon: string | null
  snippet: string
}

export interface DataLocationInfo {
  current: string
  isDefault: boolean
  totalBytes: number
}

export interface EngineCheckResult {
  ok: boolean
  message: string
}

export interface ImportedAudio {
  fileName: string
  mimeType: string
  buffer: ArrayBuffer
}

export interface MicPermissionResult {
  granted: boolean
  /** 系统设置 → 隐私与安全性 → 麦克风 中显示的应用名(开发模式为 Electron) */
  appName: string
}

export interface SaveRecordingInput {
  pageId: string
  mimeType: string
  durationMs: number
  buffer: ArrayBuffer
}

/** 音频文件的内置协议 URL(渲染层直接用于 <audio>/wavesurfer/fetch) */
export function mediaUrlFor(fileName: string): string {
  return `oasis-media://local/${encodeURIComponent(fileName)}`
}

/** 北京时间戳:yyyy/MM/dd HH:mm */
export function beijingStamp(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return fmt.format(date).replace(',', ' ').replace(/\//g, '/')
}

export interface OasisApi {
  pages: {
    list(): Promise<PageSummary[]>
    get(id: string): Promise<PageDetail | null>
    create(parentId: string | null, title?: string): Promise<PageDetail>
    rename(id: string, title: string): Promise<void>
    setIcon(id: string, icon: string | null): Promise<void>
    move(id: string, parentId: string | null, index: number): Promise<void>
    updateContent(id: string, content: BlockDoc): Promise<void>
    /** 独立更新 console 字段(立即写入,无防抖) */
    updateConsole(id: string, fields: { transcript?: string; summary?: string; notes?: string }): Promise<void>
    /** 深合并 console 字段(全局录音流水线在页面未打开时落库用) */
    mergeConsole(id: string, patch: Record<string, unknown>): Promise<void>
    trash(id: string): Promise<void>
    restore(id: string): Promise<void>
    deletePermanent(id: string): Promise<void>
    trashList(): Promise<PageSummary[]>
  }
  recordings: {
    save(input: SaveRecordingInput): Promise<RecordingInfo>
    get(id: string): Promise<RecordingInfo | null>
    listByPage(pageId: string): Promise<RecordingInfo[]>
    listAll(): Promise<RecordingListEntry[]>
    /** 读取录音文件字节(渲染进程转 blob: URL 播放,避开自定义协议的 CORS/类型问题) */
    readAudio(id: string): Promise<ArrayBuffer | null>
    updateBlock(id: string, blockId: string | null): Promise<void>
    transcribe(id: string, pcm: Int16Array, sampleRate: number, language: string): Promise<void>
    /** (重新)生成 AI 总结;进度经 recordingsChanged 事件回流 */
    summarize(id: string): Promise<void>
  }
  models: {
    status(): Promise<ModelStatus>
    ensure(): Promise<ModelStatus>
  }
  data: {
    getLocation(): Promise<DataLocationInfo>
    chooseLocation(): Promise<{ path: string | null }>
    migrateLocation(path: string): Promise<{ ok: boolean; message?: string }>
    resetLocation(): Promise<{ ok: boolean; message?: string }>
  }
  engine: {
    check(): Promise<EngineCheckResult>
  }
  search: {
    query(q: string): Promise<SearchResult[]>
  }
  system: {
    askMicPermission(): Promise<MicPermissionResult>
    importAudioFile(): Promise<ImportedAudio | null>
    openExternal(url: string): Promise<void>
    /** IP 粗定位(城市级),用于会议地点;失败返回 null */
    getCityLocation(): Promise<{ city: string; region: string; country: string } | null>
  }
  ai: {
    /** 划词动作:总结/润色/校对/解释/翻译/续写/自由提问 */
    editorAction(
      action: 'summarize' | 'polish' | 'proofread' | 'explain' | 'translate' | 'continue' | 'ask',
      text: string,
      question?: string
    ): Promise<string>
    /** 对整页正文生成结构化摘要 */
    summarizePage(pageId: string): Promise<string>
    /** 依据录音转写生成会议名称(≤10 字)与主题(一句话) */
    meetingName(transcript: string): Promise<{ name: string; topic: string }>
    /** 导出 Meeting 为 Word 文档 */
    exportMeeting(data: {
      title: string
      meetingName: string
      time: string
      location: string
      topic: string
      participants: string
      summary: string
    }): Promise<string | null>
    }
  llm: {
    getConfig(): Promise<LlmConfigState>
    setConfig(patch: { apiKey?: string; baseUrl?: string; model?: string }): Promise<LlmConfigState>
    test(): Promise<{ ok: boolean; message: string }>
  }
  on: {
    recordingsChanged(cb: (r: RecordingInfo) => void): () => void
    modelProgress(cb: (m: ModelStatus) => void): () => void
    appAction(cb: (action: string) => void): () => void
  }
}

/** AI 大模型接口配置状态(不回传完整密钥) */
export interface LlmConfigState {
  hasKey: boolean
  masked: string | null
  baseUrl: string
  model: string
}

export interface ExportMeetingData {
  title: string
  meetingName: string
  time: string
  location: string
  topic: string
  participants: string
  summary: string
}

/** 录音转写支持的语言 */
export const TRANSCRIBE_LANGUAGES: { value: string; label: string }[] = [
  { value: 'auto', label: '自动检测(中英混说)' },
  { value: 'zh', label: '中文(含粤语方向)' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'yue', label: '粤语' }
]
