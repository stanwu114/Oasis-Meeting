import { BrowserWindow } from 'electron'
import { IPC, type ModelStatus, type RecordingInfo } from '../shared/ipc'

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
