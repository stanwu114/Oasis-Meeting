import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { OasisApi } from '../shared/ipc'

const api: OasisApi = {
  pages: {
    list: () => ipcRenderer.invoke(IPC.pagesList),
    get: (id) => ipcRenderer.invoke(IPC.pagesGet, id),
    create: (parentId, title) => ipcRenderer.invoke(IPC.pagesCreate, parentId, title),
    rename: (id, title) => ipcRenderer.invoke(IPC.pagesRename, id, title),
    setIcon: (id, icon) => ipcRenderer.invoke(IPC.pagesSetIcon, id, icon),
    move: (id, parentId, index) => ipcRenderer.invoke(IPC.pagesMove, id, parentId, index),
    updateContent: (id, content) => ipcRenderer.invoke(IPC.pagesUpdateContent, id, content),
    trash: (id) => ipcRenderer.invoke(IPC.pagesTrash, id),
    restore: (id) => ipcRenderer.invoke(IPC.pagesRestore, id),
    deletePermanent: (id) => ipcRenderer.invoke(IPC.pagesDeletePermanent, id),
    trashList: () => ipcRenderer.invoke(IPC.pagesTrashList)
  },
  recordings: {
    save: (input) => ipcRenderer.invoke(IPC.recordingsSave, input),
    get: (id) => ipcRenderer.invoke(IPC.recordingsGet, id),
    listByPage: (pageId) => ipcRenderer.invoke(IPC.recordingsListByPage, pageId),
    listAll: () => ipcRenderer.invoke(IPC.recordingsListAll),
    updateBlock: (id, blockId) => ipcRenderer.invoke(IPC.recordingsUpdateBlock, id, blockId),
    transcribe: (id, pcm, sampleRate, language) =>
      ipcRenderer.invoke(IPC.recordingsTranscribe, id, pcm, sampleRate, language)
  },
  models: {
    status: () => ipcRenderer.invoke(IPC.modelsStatus),
    ensure: () => ipcRenderer.invoke(IPC.modelsEnsure)
  },
  search: {
    query: (q) => ipcRenderer.invoke(IPC.searchQuery, q)
  },
  system: {
    askMicPermission: () => ipcRenderer.invoke(IPC.systemAskMic),
    importAudioFile: () => ipcRenderer.invoke(IPC.systemImportAudio)
  },
  on: {
    recordingsChanged: (cb) => subscribe(IPC.evtRecordingsChanged, cb),
    modelProgress: (cb) => subscribe(IPC.evtModelProgress, cb),
    appAction: (cb) => subscribe('app:action', cb)
  }
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('oasis', api)
