import { BrowserWindow } from 'electron'
import { IPC, type AiChatDelta, type AiChatDone, type ModelStatus, type RecordingInfo } from '../shared/ipc'

export function broadcastRecording(rec: RecordingInfo): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.evtRecordingsChanged, rec)
  }
}

export function broadcastModelStatus(status: ModelStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.evtModelProgress, status)
  }
}

export function broadcastAiChatDelta(delta: AiChatDelta): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.evtAiChatDelta, delta)
  }
}

export function broadcastAiChatDone(done: AiChatDone): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.evtAiChatDone, done)
  }
}

export function broadcastAiChatError(error: { conversationId: string; error: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.evtAiChatError, error)
  }
}

export function broadcastAiChatStatus(status: { conversationId: string; status: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.evtAiChatStatus, status)
  }
}
