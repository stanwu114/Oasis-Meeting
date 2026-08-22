/** IPC 通道名与前后端数据契约(main / preload / renderer 共用) */

export const IPC = {
  pagesList: 'pages:list',
  pagesGet: 'pages:get',
  pagesCreate: 'pages:create',
  pagesRename: 'pages:rename',
  pagesSetIcon: 'pages:set-icon',
  pagesMove: 'pages:move',
  pagesUpdateContent: 'pages:update-content',
  pagesTrash: 'pages:trash',
  pagesRestore: 'pages:restore',
  pagesDeletePermanent: 'pages:delete-permanent',
  pagesTrashList: 'pages:trash-list',

  recordingsSave: 'recordings:save',
  recordingsGet: 'recordings:get',
  recordingsListByPage: 'recordings:list-by-page',
  recordingsUpdateBlock: 'recordings:update-block',
  recordingsTranscribe: 'recordings:transcribe',

  modelsStatus: 'models:status',
  modelsEnsure: 'models:ensure',

  searchQuery: 'search:query',

  systemAskMic: 'system:ask-mic',
  systemImportAudio: 'system:import-audio',

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

export interface RecordingInfo {
  id: string
  pageId: string
  blockId: string | null
  fileName: string
  mimeType: string
  durationMs: number
  transcript: string | null
  language: string
  engine: string
  status: TranscribeStatus
  error: string | null
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

export interface OasisApi {
  pages: {
    list(): Promise<PageSummary[]>
    get(id: string): Promise<PageDetail | null>
    create(parentId: string | null, title?: string): Promise<PageDetail>
    rename(id: string, title: string): Promise<void>
    setIcon(id: string, icon: string | null): Promise<void>
    move(id: string, parentId: string | null, index: number): Promise<void>
    updateContent(id: string, content: BlockDoc): Promise<void>
    trash(id: string): Promise<void>
    restore(id: string): Promise<void>
    deletePermanent(id: string): Promise<void>
    trashList(): Promise<PageSummary[]>
  }
  recordings: {
    save(input: SaveRecordingInput): Promise<RecordingInfo>
    get(id: string): Promise<RecordingInfo | null>
    listByPage(pageId: string): Promise<RecordingInfo[]>
    updateBlock(id: string, blockId: string | null): Promise<void>
    transcribe(id: string, pcm: Int16Array, sampleRate: number, language: string): Promise<void>
  }
  models: {
    status(): Promise<ModelStatus>
    ensure(): Promise<ModelStatus>
  }
  search: {
    query(q: string): Promise<SearchResult[]>
  }
  system: {
    askMicPermission(): Promise<MicPermissionResult>
    importAudioFile(): Promise<ImportedAudio | null>
  }
  on: {
    recordingsChanged(cb: (r: RecordingInfo) => void): () => void
    modelProgress(cb: (m: ModelStatus) => void): () => void
    appAction(cb: (action: string) => void): () => void
  }
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
