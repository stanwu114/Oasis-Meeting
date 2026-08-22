import { useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { AudioPlayer } from './AudioPlayer'
import { useRecordingsStore } from '../stores/recordingsStore'
import { insertTranscriptAsParagraphs } from './bridge'
import { retranscribe } from '../audio/pipeline'
import { useUiStore } from '../stores/uiStore'
import { formatDuration } from '../audio/pcm'
import type { TranscribeStatus } from '../../../shared/ipc'

const STATUS_LABEL: Record<TranscribeStatus, string> = {
  pending: '等待转写',
  'downloading-model': '下载模型中…',
  transcribing: '本地转写中…',
  done: '转写完成',
  error: '转写失败'
}

function RecordingBlockView({ block }: { block: { id: string; props: Record<string, string | number> } }) {
  const [showTranscript, setShowTranscript] = useState(true)
  const [busy, setBusy] = useState(false)
  const rec = useRecordingsStore((s) => s.byId[String(block.props.recordingId)])
  const showToast = useUiStore((s) => s.showToast)

  const transcript: string = rec?.transcript ?? String(block.props.transcript ?? '')
  const status: TranscribeStatus = rec?.status ?? (transcript ? 'done' : 'pending')
  const durationMs = Number(block.props.durationMs) || rec?.durationMs || 0

  const handleRetranscribe = async (): Promise<void> => {
    if (!rec || busy) return
    setBusy(true)
    try {
      await retranscribe(rec)
    } catch (e) {
      showToast(`重新转写失败:${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleInsert = (): void => {
    insertTranscriptAsParagraphs(block.id, transcript)
  }

  return (
    <div className="recording-block">
      <div className="recording-block-main">
        <span className="recording-block-icon">🎙</span>
        <AudioPlayer url={String(block.props.url)} />
        <span className="recording-block-duration">{formatDuration(durationMs)}</span>
      </div>
      <div className="recording-block-meta">
        <span className={`recording-status status-${status}`}>{STATUS_LABEL[status]}</span>
        {status === 'error' && rec?.error ? <span className="recording-error-text">{rec.error}</span> : null}
        {transcript ? (
          <>
            <button type="button" className="link-btn" onClick={handleInsert}>
              转为正文
            </button>
            <button type="button" className="link-btn" onClick={() => setShowTranscript((v) => !v)}>
              {showTranscript ? '收起文稿' : '展开文稿'}
            </button>
          </>
        ) : null}
        {rec ? (
          <button type="button" className="link-btn" onClick={() => void handleRetranscribe()} disabled={busy}>
            重新转写
          </button>
        ) : null}
      </div>
      {transcript && showTranscript ? <div className="recording-transcript">{transcript}</div> : null}
    </div>
  )
}

export const RecordingBlock = createReactBlockSpec(
  {
    type: 'recording',
    propSchema: {
      recordingId: { default: '' },
      url: { default: '' },
      mimeType: { default: 'audio/webm' },
      durationMs: { default: 0 },
      transcript: { default: '' },
      language: { default: 'auto' }
    },
    content: 'none'
  },
  {
    render: (props) => <RecordingBlockView block={props.block as never} />
  }
)
