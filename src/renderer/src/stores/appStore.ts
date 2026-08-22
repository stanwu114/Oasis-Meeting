import { create } from 'zustand'
import { beijingStamp } from '../../../shared/ipc'
import type { BlockDoc, PageDetail, PageSummary } from '../../../shared/ipc'

interface AppState {
  pages: PageSummary[]
  currentId: string | null
  currentTitle: string
  currentIcon: string | null
  currentContent: BlockDoc | null
  loaded: boolean
  expanded: Record<string, boolean>

  init(): Promise<void>
  refresh(): Promise<void>
  openPage(id: string): Promise<void>
  createPage(parentId: string | null, title?: string, opts?: { select?: boolean }): Promise<string>
  renamePage(id: string, title: string): Promise<void>
  setIcon(id: string, icon: string | null): Promise<void>
  trashPage(id: string): Promise<void>
  moveRelative(dragId: string, targetId: string, zone: 'before' | 'after' | 'inside'): Promise<void>
  toggleExpand(id: string): void
  setCurrentTitleLocal(title: string): void
}

const api = window.oasis

function welcomeDoc(): BlockDoc {
  return [
    {
      type: 'heading',
      props: { level: 2 },
      content: [{ type: 'text', text: '欢迎使用 Notion Oasis', styles: {} }],
      children: []
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '这是一个完全本地化的笔记空间:所有页面、录音与转写都只保存在你的电脑上。', styles: {} }
      ],
      children: []
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '点击左侧 🎙 开始录音,停止后自动调用本地 SenseVoice 引擎转写(首次使用需下载约 240MB 模型);也可以 ⬆ 导入 mp3/m4a/wav 等音频文件转写。',
          styles: {}
        }
      ],
      children: []
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '输入 / 打开块菜单,支持标题、列表、待办、引用、代码等块。按 ⌘K 全文搜索。', styles: {} }
      ],
      children: []
    }
  ]
}

let initPromise: Promise<void> | null = null

export const useAppStore = create<AppState>((set, get) => ({
  pages: [],
  currentId: null,
  currentTitle: '',
  currentIcon: null,
  currentContent: null,
  loaded: false,
  expanded: {},

  init: async () => {
    // StrictMode 下 effect 会执行两次,单飞防止欢迎页重复创建
    if (initPromise) return initPromise
    initPromise = (async () => {
      const pages = await api.pages.list()
      if (pages.length === 0) {
        // 首次运行:创建欢迎页
        const detail = await api.pages.create(null, '欢迎使用 Notion Oasis')
        await api.pages.updateContent(detail.id, welcomeDoc())
        set({ pages: await api.pages.list(), loaded: true })
        await get().openPage(detail.id)
        return
      }
      set({ pages, loaded: true })
      await get().openPage(pages[0].id)
    })()
    return initPromise
  },

  refresh: async () => {
    const pages = await api.pages.list()
    set({ pages, loaded: true })
  },

  openPage: async (id) => {
    const detail: PageDetail | null = await api.pages.get(id)
    if (!detail) return
    set({
      currentId: id,
      currentTitle: detail.title,
      currentIcon: detail.icon,
      currentContent: detail.content ?? []
    })
    // 展开祖先
    const { pages, expanded } = get()
    const ancestors: Record<string, boolean> = {}
    let cur = pages.find((p) => p.id === id)?.parentId ?? null
    while (cur) {
      ancestors[cur] = true
      cur = pages.find((p) => p.id === cur)?.parentId ?? null
    }
    if (Object.keys(ancestors).length > 0) set({ expanded: { ...expanded, ...ancestors } })
    await get().refresh()
  },

  createPage: async (parentId, title, opts) => {
    // Meeting 模板:不指定标题的新页面 → 「未命名会议@北京时间」+ 会议信息卡
    const useTemplate = !title
    const stamp = title ? '' : beijingStamp()
    const detail = await api.pages.create(parentId, title ?? `未命名会议@${stamp}`)
    if (useTemplate) {
      await api.pages.updateContent(detail.id, [
        { type: 'meetingMeta', props: { time: stamp } },
        { type: 'paragraph', content: [], children: [] }
      ])
    }
    await get().refresh()
    if (parentId) set((s) => ({ expanded: { ...s.expanded, [parentId]: true } }))
    if (opts?.select !== false) await get().openPage(detail.id)
    return detail.id
  },

  renamePage: async (id, title) => {
    if (get().currentId === id) set({ currentTitle: title })
    await api.pages.rename(id, title)
    await get().refresh()
  },

  setIcon: async (id, icon) => {
    if (get().currentId === id) set({ currentIcon: icon })
    await api.pages.setIcon(id, icon)
    await get().refresh()
  },

  trashPage: async (id) => {
    await api.pages.trash(id)
    if (get().currentId === id) set({ currentId: null, currentContent: null, currentTitle: '' })
    await get().refresh()
    const pages = get().pages
    if (pages.length > 0 && !get().currentId) await get().openPage(pages[0].id)
  },

  moveRelative: async (dragId, targetId, zone) => {
    const { pages } = get()
    const target = pages.find((p) => p.id === targetId)
    if (!target || dragId === targetId) return
    try {
      if (zone === 'inside') {
        await api.pages.move(dragId, targetId, target.childCount)
      } else {
        const siblings = pages.filter((p) => p.parentId === target.parentId && p.id !== dragId)
        const idx = siblings.findIndex((p) => p.id === targetId)
        if (idx < 0) return
        await api.pages.move(dragId, target.parentId, zone === 'before' ? idx : idx + 1)
      }
      if (zone === 'inside') set((s) => ({ expanded: { ...s.expanded, [targetId]: true } }))
    } finally {
      await get().refresh()
    }
  },

  toggleExpand: (id) => {
    set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } }))
  },

  setCurrentTitleLocal: (title) => set({ currentTitle: title })
}))
