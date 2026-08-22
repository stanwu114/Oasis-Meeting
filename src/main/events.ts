import { BrowserWindow } from 'electron'
import { IPC, type AiPanelState, type ModelStatus, type RecordingInfo } from '../shared/ipc'

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

export function broadcastAiState(state: AiPanelState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.evtAiState, state)
  }
}
