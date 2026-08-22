import { useEffect, useRef, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { Icon } from '../components/Icon'
import { formatDuration } from '../audio/pcm'
import { MicRecorder } from '../audio/MicRecorder'
import fixWebmDuration from 'fix-webm-duration'
import { decodeToPcm16kMono } from '../audio/pcm'
import { getEditor } from './bridge'

/**
 * 会议控制台:常驻录音条 + 三个标签页(会议笔记 / 文字转写稿 / AI会议纪要)
 * 录音完成后自动切换到 AI 纪要标签。
 */

type Tab = 'notes' | 'transcript' | 'summary'
type RecStatus = 'idle' | 'recording' | 'paused' | 'transcribing' | 'summarizing' | 'done' | 'error'

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'notes', label: '会议笔记' },
  { key: 'transcript', label: '文字转写稿' },
  { key: 'summary', label: 'AI 会议纪要' }
]

/* ---------- 波形画布 ---------- */
function WaveCanvas({ recorder, active }: { recorder: MicRecorder | null; active: boolean }): React.ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const draw = (): void => {
      const canvas = canvasRef.current
      if (canvas && recorder) {
        const levels = recorder.tickLevels()
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        if (w > 0 && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) {
          canvas.width = Math.round(w * dpr)
          canvas.height = Math.round(h * dpr)
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, w, h)
          const style = getComputedStyle(document.documentElement)
          ctx.fillStyle = style.getPropertyValue('--accent').trim() || '#b45306'
          const barW = 3
          const gap = 2
          const count = Math.max(1, Math.floor(w / (barW + gap)))
          const view = levels.slice(-count)
          const x0 = w - view.length * (barW + gap)
          for (let i = 0; i < view.length; i++) {
            const v = Math.max(0.06, Math.min(1, view[i]))
            const barH = v * h * 0.9
            ctx.fillRect(x0 + i * (barW + gap), (h - barH) / 2, barW, barH)
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, recorder])
  return <canvas ref={canvasRef} className="console-wave" />
}

/* ---------- 主组件 ---------- */
function MeetingConsoleView({ block }: { block: { id: string; props: Record<string, string> } }): React.ReactNode {
  const [recStatus, setRecStatus] = useState<RecStatus>((block.props.status as RecStatus) || 'idle')
  const [activeTab, setActiveTab] = useState<Tab>((block.props.activeTab as Tab) || 'notes')
  const [elapsed, setElapsed] = useState(0)
  const [notes, setNotes] = useState(block.props.notes || '')
  const [errorMsg, setErrorMsg] = useState('')
  const recorderRef = useRef<MicRecorder | null>(null)
  const timerRef = useRef<number | null>(null)
  const notesTimer = useRef<number | null>(null)

  const updateProps = (patch: Record<string, string>): void => {
    const editor = getEditor()
    if (!editor) return
    try {
      editor.updateBlock(block.id, { props: patch } as never)
    } catch {
      /* noop */
    }
  }

  /* 保存笔记(防抖) */
  const onNotesChange = (value: string): void => {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = window.setTimeout(() => updateProps({ notes: value }), 500)
  }

  /* 计时器 */
  const startTimer = (): void => {
    timerRef.current = window.setInterval(() => {
      if (recorderRef.current) setElapsed(recorderRef.current.elapsedMs)
    }, 200)
  }
  const stopTimer = (): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  /* AI 总结:通过 IPC */
  const summarizeViaIpc = async (recordingId: string): Promise<string> => {
    return new Promise<string>((resolve) => {
      const unsub = window.oasis.on.recordingsChanged((r) => {
        if (r.id === recordingId && r.summaryStatus === 'done') {
          unsub()
          resolve(r.summary || '')
        }
        if (r.id === recordingId && r.summaryStatus === 'error') {
          unsub()
          resolve('')
        }
      })
      void window.oasis.recordings.summarize(recordingId)
    })
  }

  /* 开始录音 */
  const startRec = async (): Promise<void> => {
    try {
      const granted = await window.oasis.system.askMicPermission()
      if (!granted) throw new Error('麦克风权限被拒绝')
      const rec = new MicRecorder()
      await rec.start()
      recorderRef.current = rec
      setRecStatus('recording')
      setElapsed(0)
      startTimer()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setRecStatus('error')
    }
  }

  /* 暂停/继续 */
  const togglePause = (): void => {
    const rec = recorderRef.current
    if (!rec) return
    if (recStatus === 'recording') {
      rec.pause()
      setRecStatus('paused')
      stopTimer()
    } else if (recStatus === 'paused') {
      rec.resume()
      setRecStatus('recording')
      startTimer()
    }
  }

  /* 结束录音 → 转写 → AI 纪要 */
  const stopRec = async (): Promise<void> => {
    const rec = recorderRef.current
    if (!rec) return
    stopTimer()
    setRecStatus('transcribing')
    try {
      const { blob, durationMs } = await rec.stop()
      recorderRef.current = null

      // 修 webm 时长 + 解码 PCM
      let fixed = blob
      if (blob.type.includes('webm') && durationMs > 0) {
        try { fixed = await fixWebmDuration(blob, durationMs) } catch { /* ignore */ }
      }
      const { pcm } = await decodeToPcm16kMono(fixed)

      // 保存录音文件
      const buffer = await fixed.arrayBuffer()
      const recInfo = await window.oasis.recordings.save({
        pageId: block.props.pageId || '',
        mimeType: fixed.type || 'audio/webm',
        durationMs,
        buffer
      })

      // 更新块 props
      updateProps({ status: 'transcribing', durationMs: String(durationMs), recordingId: recInfo.id })

      // 转写
      setRecStatus('transcribing')
      setActiveTab('transcript')
      const lang = localStorage.getItem('oasis.language') || 'auto'
      const fullTranscript = await new Promise<string>((resolve) => {
        let result = ''
        const unsub = window.oasis.on.recordingsChanged((r) => {
          if (r.id === recInfo.id && r.status === 'done') {
            result = r.transcript || ''
            unsub()
            resolve(result)
          }
          if (r.id === recInfo.id && r.status === 'error') {
            unsub()
            resolve('')
          }
        })
        void window.oasis.recordings.transcribe(recInfo.id, pcm, 16000, lang)
      })

      if (fullTranscript) {
        updateProps({ transcript: fullTranscript, status: 'summarizing' })
        setRecStatus('summarizing')
        // AI 总结
        try {
          const summary = await summarizeViaIpc(recInfo.id)
          updateProps({ summary, status: 'done' })
          setRecStatus('done')
          setActiveTab('summary')
        } catch {
          updateProps({ status: 'done' })
          setRecStatus('done')
          setActiveTab('summary')
        }
      } else {
        updateProps({ status: 'error' })
        setRecStatus('error')
        setErrorMsg('转写失败')
      }
    } catch (e) {
      recorderRef.current?.cancel()
      recorderRef.current = null
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setRecStatus('error')
    }
  }


  useEffect(() => {
    return () => {
      stopTimer()
      recorderRef.current?.cancel()
    }
  }, [])

  const isRecording = recStatus === 'recording' || recStatus === 'paused'
  const busy = recStatus === 'transcribing' || recStatus === 'summarizing'

  return (
    <div className="meeting-console">
      {/* ─── 录音控制条(常驻) ─── */}
      <div className="console-bar">
        <div className="console-controls">
          {recStatus === 'idle' || recStatus === 'done' || recStatus === 'error' ? (
            <button type="button" className="console-btn start" onClick={() => void startRec()}>
              <Icon name="mic" size={16} /> 开始录音
            </button>
          ) : null}
          {isRecording ? (
            <>
              <button type="button" className="console-btn pause" onClick={togglePause}>
                {recStatus === 'paused' ? '继续' : '暂停'}
              </button>
              <button type="button" className="console-btn stop" onClick={() => void stopRec()}>
                <Icon name="stop" size={13} /> 结束录音
              </button>
            </>
          ) : null}
          {busy ? (
            <span className="console-status">
              <span className="spin" /> {recStatus === 'transcribing' ? '转写中…' : '生成纪要…'}
            </span>
          ) : null}
          {recStatus === 'error' ? <span className="console-error">{errorMsg}</span> : null}
        </div>
        {isRecording ? (
          <>
            <span className={`console-timer${recStatus === 'paused' ? ' paused' : ''}`}>{formatDuration(elapsed)}</span>
            <WaveCanvas recorder={recorderRef.current} active={recStatus === 'recording'} />
          </>
        ) : null}
      </div>

      {/* ─── 三标签页 ─── */}
      <div className="console-tabs">
        {TAB_LABELS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`console-tab${activeTab === t.key ? ' on' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="console-content">
        {activeTab === 'notes' ? (
          <textarea
            className="console-notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="在这里手动记录会议内容…"
            rows={Math.max(4, notes.split('\n').length + 1)}
          />
        ) : null}
        {activeTab === 'transcript' ? (
          <div className="console-text">
            {block.props.transcript
              ? block.props.transcript.split(/\n{2,}/).map((p, i) => (
                  <p key={i} className="console-para">{p.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, '')}</p>
                ))
              : busy ? <div className="console-loading"><div className="shimmer-line" style={{ width: '80%' }} /><div className="shimmer-line" style={{ width: '60%' }} /><div className="shimmer-line" style={{ width: '40%' }} /></div>
              : <span className="console-empty">录音完成后转写文稿会显示在这里</span>}
          </div>
        ) : null}
        {activeTab === 'summary' ? (
          <div className="console-text">
            {block.props.summary ? (
              block.props.summary.split('\n').map((line, i) => {
                const t = line.trim()
                if (!t) return null
                if (t.startsWith('## ')) return <div key={i} className="console-heading">{t.slice(3)}</div>
                if (/^[-*]\s/.test(t)) return <div key={i} className="console-bullet"><span className="console-dot" /><span>{t.replace(/^[-*]\s/, '')}</span></div>
                return <p key={i} className="console-para">{t}</p>
              })
            ) : busy ? (
              <div className="console-loading"><div className="shimmer-line" style={{ width: '70%' }} /><div className="shimmer-line" style={{ width: '85%' }} /><div className="shimmer-line" style={{ width: '50%' }} /></div>
            ) : (
              <span className="console-empty">录音完成后 AI 会议纪要会显示在这里</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const MeetingConsoleBlock = createReactBlockSpec(
  {
    type: 'meetingConsole',
    propSchema: {
      notes: { default: '' },
      transcript: { default: '' },
      summary: { default: '' },
      status: { default: 'idle' },
      activeTab: { default: 'notes' },
      recordingId: { default: '' },
      durationMs: { default: 0 },
      pageId: { default: '' }
    },
    content: 'none'
  },
  {
    render: (props) => <MeetingConsoleView block={props.block as never} />
  }
)
