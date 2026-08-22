import { useEffect, useState } from 'react'
import type { RecordingListEntry } from '../../../shared/ipc'
import { useUiStore } from '../stores/uiStore'
import { useAppStore } from '../stores/appStore'
import { useRecordingsStore } from '../stores/recordingsStore'
import { formatDuration } from '../audio/pcm'
import { useRecorderStore } from '../stores/recorderStore'

const STATUS_LABEL: Record<string, string> = {
  pending: '排队中',
  'downloading-model': '下载模型中',
  transcribing: '转写中',
  done: '已完成',
  error: '失败'
}

export function RecordingsView() {
  const [items, setItems] = useState<RecordingListEntry[]>([])
  const recordingPhase = useRecorderStore((s) => s.phase)

  const reload = (): void => {
    void window.oasis.recordings.listAll().then(setItems)
  }
  useEffect(reload, [recordingPhase])

  // 转写状态事件到达时刷新列表
  useEffect(() => {
    return useRecordingsStore.subscribe(() => reload())
  }, [])

  const openPage = (pageId: string): void => {
    useUiStore.getState().setView('editor')
    void useAppStore.getState().openPage(pageId)
  }

  return (
    <div className="recordings-view">
      <div className="recordings-head">
        <h1 className="recordings-title">录音</h1>
        <button type="button" className="btn primary" onClick={() => void useRecorderStore.getState().start()}>
          🎙 开始录音
        </button>
      </div>
      <p className="recordings-sub">所有录音与导入的音频都在这里,点击打开所在的笔记页面。转写完全在本地进行。</p>

      <div className="recordings-list">
        {items.length === 0 ? (
          <div className="recordings-empty">
            <div className="recordings-empty-icon">🎙</div>
            <p>还没有录音。点击右上角「开始录音」,或直接把音频文件拖进笔记。</p>
          </div>
        ) : null}
        {items.map((r) => (
          <button type="button" key={r.id} className="recording-row" onClick={() => openPage(r.pageId)}>
            <span className="recording-row-icon">🎙</span>
            <span className="recording-row-body">
              <span className="recording-row-title">{r.transcriptPreview || '未转写'}</span>
              <span className="recording-row-meta">
                {r.pageTitle} · {new Date(r.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
            <span className="recording-row-side">
              <span className={`recording-row-status s-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
              <span className="recording-row-duration">{formatDuration(r.durationMs)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
