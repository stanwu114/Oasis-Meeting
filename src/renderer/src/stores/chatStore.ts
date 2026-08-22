import { create } from 'zustand'
import type { AiChatMessage, AiConversation } from '../../../shared/ipc'
import { useAppStore } from './appStore'
import { useUiStore } from './uiStore'

interface ChatState {
  conversations: AiConversation[]
  currentId: string | null
  messages: AiChatMessage[]
  streamingText: string
  sending: boolean
  contextPageOn: boolean
  historyOpen: boolean

  load(): Promise<void>
  select(id: string): Promise<void>
  newChat(): void
  send(text: string): Promise<void>
  stop(): void
  remove(id: string): Promise<void>
  toggleContextPage(): void
  setHistoryOpen(open: boolean): void
  /** 由 App 全局订阅的流式事件回调 */
  onDelta(conversationId: string, delta: string): void
  onDone(conversationId: string, content: string): void
  onError(conversationId: string, error: string): void
}

function currentSelection(): string | null {
  const sel = window.getSelection()?.toString().trim()
  if (sel && sel.length >= 2) return sel.slice(0, 4000)
  return null
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentId: null,
  messages: [],
  streamingText: '',
  sending: false,
  contextPageOn: true,
  historyOpen: false,

  load: async () => {
    const conversations = await window.oasis.chat.conversations()
    set({ conversations })
    if (conversations.length > 0 && !get().currentId) await get().select(conversations[0].id)
  },

  select: async (id) => {
    const messages = await window.oasis.chat.messages(id)
    set({ currentId: id, messages, streamingText: '', historyOpen: false })
  },

  newChat: () => set({ currentId: null, messages: [], streamingText: '', historyOpen: false }),

  send: async (text) => {
    const t = text.trim()
    if (!t || get().sending) return
    const optimistic: AiChatMessage = {
      id: `tmp-${Date.now()}`,
      conversationId: get().currentId ?? '',
      role: 'user',
      content: t,
      createdAt: new Date().toISOString()
    }
    set((s) => ({ messages: [...s.messages, optimistic], sending: true, streamingText: '' }))
    try {
      const { conversationId } = await window.oasis.chat.send({
        conversationId: get().currentId,
        text: t,
        contextPageId: get().contextPageOn ? useAppStore.getState().currentId : null,
        contextSelection: currentSelection()
      })
      if (conversationId !== get().currentId) set({ currentId: conversationId })
      await get().load()
    } catch (e) {
      useUiStore.getState().showToast(`发送失败:${e instanceof Error ? e.message : String(e)}`, 'error')
      set((s) => ({ messages: s.messages.filter((m) => m.id !== optimistic.id), sending: false }))
    }
  },

  stop: () => {
    void window.oasis.chat.stop()
  },

  remove: async (id) => {
    await window.oasis.chat.delete(id)
    const rest = get().conversations.filter((c) => c.id !== id)
    set({ conversations: rest })
    if (get().currentId === id) {
      if (rest.length > 0) await get().select(rest[0].id)
      else get().newChat()
    }
  },

  toggleContextPage: () => set((s) => ({ contextPageOn: !s.contextPageOn })),
  setHistoryOpen: (open) => set({ historyOpen: open }),

  onDelta: (conversationId, delta) => {
    if (conversationId !== get().currentId) return
    set((s) => ({ streamingText: s.streamingText + delta }))
  },

  onDone: (conversationId, content) => {
    if (conversationId !== get().currentId) return
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `a-${Date.now()}`,
          conversationId,
          role: 'assistant',
          content,
          createdAt: new Date().toISOString()
        }
      ],
      streamingText: '',
      sending: false
    }))
  },

  onError: (conversationId, error) => {
    if (conversationId !== get().currentId) return
    useUiStore.getState().showToast(`AI 回复出错:${error}`, 'error')
    set({ sending: false, streamingText: '' })
  }
}))
