import { useEffect, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { AudioPlayer } from './AudioPlayer'
import { useRecordingsStore } from '../stores/recordingsStore'
import { insertTranscriptAsParagraphs } from './bridge'
import { retranscribe } from '../audio/pipeline'
import { useUiStore } from '../stores/uiStore'
import { formatDuration } from '../audio/pcm'
import type { TranscribeStatus } from '../../../shared/ipc'

const STATUS_LABEL: Record<TranscribeStatus, string> = {
  pending: '排队中',
  'downloading-model': '下载模型中…',
  transcribing: '转写中…',
  done: '转写完成',
  error: '转写失败'
}

interface TranscriptLine {
  stamp: string
  text: string
}

function parseTranscript(raw: string): TranscriptLine[] {
  return raw
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/.exec(line)
      return m ? { stamp: m[1], text: line.slice(m[0].length) } : { stamp: '', text: line }
    })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${time}`
}

function RecordingBlockView({ block }: { block: { id: string; props: Record<string, string | number> } }) {
  const [busy, setBusy] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioState, setAudioState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const rec = useRecordingsStore((s) => s.byId[String(block.props.recordingId)])
  const showToast = useUiStore((s) => s.showToast)
  const recId = rec?.id

  /* 通过 IPC 读取音频字节,转 blob: URL 播放(同源,绕开自定义协议的种种限制) */
  useEffect(() => {
    if (!recId) return
    let url: string | null = null
    let cancelled = false
    setAudioState('loading')
    void window.oasis.recordings.readAudio(recId).then((buf) => {
      if (cancelled) return
      if (!buf) {
        setAudioState('missing')
        return
      }
      url = URL.createObjectURL(new Blob([buf], { type: rec?.mimeType || 'audio/webm' }))
      setAudioUrl(url)
      setAudioState('ready')
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [recId, rec?.mimeType])

  const transcript: string = rec?.transcript ?? String(block.props.transcript ?? '')
  const status: TranscribeStatus = rec?.status ?? (transcript ? 'done' : 'pending')
  const durationMs = Number(block.props.durationMs) || rec?.durationMs || 0
  const lines = parseTranscript(transcript)
  const working = status === 'transcribing' || status === 'pending' || status === 'downloading-model'

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
    // 插入正文时去掉时间戳前缀
    const plain = lines.map((l) => l.text).join('\n\n')
    insertTranscriptAsParagraphs(block.id, plain)
  }

  return (
    <div className="meeting-block">
      <div className="meeting-head">
        <span className="meeting-icon">🎙</span>
        <span className="meeting-title">会议记录</span>
        <span className="meeting-date">{rec ? formatDate(rec.createdAt) : ''}</span>
        <span className="meeting-duration">{formatDuration(durationMs)}</span>
      </div>

      <div className="meeting-player">
        {audioState === 'loading' ? (
          <span className="meeting-player-hint">音频加载中…</span>
        ) : audioState === 'missing' ? (
          <span className="meeting-player-hint">音频文件缺失(文稿仍保留)</span>
        ) : audioUrl ? (
          <AudioPlayer url={audioUrl} />
        ) : null}
      </div>

      <div className="meeting-status-row">
        <span className={`meeting-status status-${status}`}>
          {status === 'transcribing' ? <span className="spin" /> : null}
          {STATUS_LABEL[status]}
        </span>
        {status === 'error' && rec?.error ? <span className="meeting-error">{rec.error}</span> : null}
        {rec ? (
          <button type="button" className="link-btn" onClick={() => void handleRetranscribe()} disabled={busy || working}>
            重新转写
          </button>
        ) : null}
        {lines.length > 0 ? (
          <button type="button" className="link-btn" onClick={handleInsert}>
            转为正文
          </button>
        ) : null}
      </div>

      {working ? (
        <div className="meeting-transcript-loading">
          <div className="shimmer-line" style={{ width: '88%' }} />
          <div className="shimmer-line" style={{ width: '72%' }} />
          <div className="shimmer-line" style={{ width: '56%' }} />
        </div>
      ) : lines.length > 0 ? (
        <div className="meeting-transcript">
          {lines.map((line, i) => (
            <p key={i} className="meeting-line">
              {line.stamp ? <span className="meeting-stamp">{line.stamp}</span> : null}
              <span>{line.text}</span>
            </p>
          ))}
        </div>
      ) : status === 'error' ? null : (
        <div className="meeting-transcript-empty">暂无文稿</div>
      )}
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
