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

  aiEditorAction: 'ai:editor-action',
  aiSummarizePage: 'ai:summarize-page',

  harnessStart: 'harness:start',
  harnessStop: 'harness:stop',
  harnessStatus: 'harness:status',
  harnessGetSettings: 'harness:get-settings',
  harnessSetSettings: 'harness:set-settings',
  harnessSessions: 'harness:sessions',
  harnessApiKeyGet: 'harness:apikey-get',
  harnessApiKeySet: 'harness:apikey-set',
  harnessSkillsList: 'harness:skills-list',
  harnessSkillsDelete: 'harness:skills-delete',
  harnessSkillsInstall: 'harness:skills-install',
  harnessSkillsReveal: 'harness:skills-reveal',

  evtRecordingsChanged: 'evt:recordings-changed',
  evtModelProgress: 'evt:model-progress',
  evtHarnessState: 'evt:harness-state'
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
  search: {
    query(q: string): Promise<SearchResult[]>
  }
  system: {
    askMicPermission(): Promise<MicPermissionResult>
    importAudioFile(): Promise<ImportedAudio | null>
    openExternal(url: string): Promise<void>
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
  }
  harness: {
    start(): Promise<HarnessState>
    stop(): Promise<void>
    status(): Promise<HarnessState>
    getSettings(): Promise<HarnessSettings | null>
    setSettings(patch: { model?: string; reasoningEffort?: string }): Promise<HarnessSettings>
    /** 历史会话(读 ~/.dsh 会话存储) */
    sessions(): Promise<HarnessSession[]>
    getApiKey(): Promise<HarnessApiKeyState>
    setApiKey(key: string | null): Promise<HarnessApiKeyState>
    listSkills(): Promise<HarnessSkill[]>
    deleteSkill(id: string): Promise<void>
    installSkillFromDir(): Promise<{ name: string } | null>
    revealSkillsDir(): Promise<void>
  }
  on: {
    recordingsChanged(cb: (r: RecordingInfo) => void): () => void
    modelProgress(cb: (m: ModelStatus) => void): () => void
    harnessStateChanged(cb: (s: HarnessState) => void): () => void
    appAction(cb: (action: string) => void): () => void
  }
}

/** Harness(dsh web)运行状态 */
export interface HarnessState {
  status: 'unavailable' | 'stopped' | 'starting' | 'ready' | 'error'
  url: string | null
  error: string | null
}

/** Harness 设置(~/.dsh/settings.yaml 的 agent-default-model) */
export interface HarnessSettings {
  provider: string
  model: string
  reasoningEffort: string
}

/** dsh 历史会话条目 */
export interface HarnessSession {
  id: string
  title: string
  timeMs: number
  workspace: string
}

/** 已安装的 dsh 技能 */
export interface HarnessSkill {
  id: string
  name: string
  description: string
}

/** API Key 状态(不回传完整密钥) */
export interface HarnessApiKeyState {
  hasKey: boolean
  masked: string | null
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
