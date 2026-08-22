import { useEffect, useRef, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { Icon } from '../components/Icon'
import { formatDuration } from '../audio/pcm'
import { MicRecorder } from '../audio/MicRecorder'
import fixWebmDuration from 'fix-webm-duration'
import { decodeToPcm16kMono } from '../audio/pcm'
import { getEditor } from './bridge'
import { useAppStore } from '../stores/appStore'
import WaveSurfer from 'wavesurfer.js'

/**
 * 会议控制台:常驻录音条 + 三个标签页(会议笔记 / 录音转写稿 / AI会议纪要)
 * 录音完成后自动切换到 AI 纪要标签。
 */

type Tab = 'notes' | 'transcript' | 'summary'
type RecStatus = 'idle' | 'recording' | 'paused' | 'importing' | 'transcribing' | 'summarizing' | 'done' | 'error'

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'notes', label: '会议笔记' },
  { key: 'transcript', label: '录音转写稿' },
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
          const barW = 4
          const gap = 2
          const count = Math.max(1, Math.floor(w / (barW + gap)))
          const view = levels.slice(-count)
          // 右对齐:最新柱子贴右边缘,旧的往左排;刚开始左侧空白是正常的
          // view[i]: i=0 是最旧的, i=length-1 是最新的
          // 新的从右边缘进来,把旧的往左推
          for (let i = 0; i < view.length; i++) {
            const v = Math.max(0.04, Math.min(1, view[i]))
            const barH = v * h * 0.95
            const x = w - (view.length - i) * (barW + gap)
            ctx.fillRect(x, (h - barH) / 2, barW, barH)
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

/* ---------- 回放播放器(wavesurfer) ---------- */
function PlaybackPlayer({ recordingId, onReady }: { recordingId: string; onReady?: (ws: WaveSurfer) => void }): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    void window.oasis.recordings.readAudio(recordingId).then((buf) => {
      if (cancelled || !buf || !containerRef.current) return
      url = URL.createObjectURL(new Blob([buf]))
      const style = getComputedStyle(document.documentElement)
      const ws = WaveSurfer.create({
        container: containerRef.current,
        url,
        height: 36,
        waveColor: style.getPropertyValue('--wave').trim() || '#e3ded4',
        progressColor: style.getPropertyValue('--accent').trim() || '#ff7a00',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        cursorWidth: 0,
        normalize: true
      })
      wsRef.current = ws
      ws.on('ready', () => {
        setReady(true)
        setDuration(ws.getDuration())
        onReady?.(ws)
      })
      ws.on('timeupdate', (t: number) => setCurrent(t))
      ws.on('play', () => setPlaying(true))
      ws.on('pause', () => setPlaying(false))
      ws.on('finish', () => setPlaying(false))
    })
    return () => {
      cancelled = true
      wsRef.current?.destroy()
      wsRef.current = null
      if (url) URL.revokeObjectURL(url)
    }
  }, [recordingId])

  return (
    <div className="console-playback">
      <button
        type="button"
        className="console-play-btn"
        onClick={() => wsRef.current?.playPause()}
        disabled={!ready}
        aria-label={playing ? '暂停' : '播放'}
      >
        <Icon name={playing ? 'stop' : 'play'} size={13} />
      </button>
      <div className="console-play-wave" ref={containerRef} />
      <span className="console-play-time">
        {ready ? `${formatDuration(current * 1000)} / ${formatDuration(duration * 1000)}` : '加载中…'}
      </span>
    </div>
  )
}

/* ---------- 主组件 ---------- */
function MeetingConsoleView({ block }: { block: { id: string; props: Record<string, string> } }): React.ReactNode {
  const [recStatus, setRecStatus] = useState<RecStatus>((block.props.status as RecStatus) || 'idle')
  const [activeTab, setActiveTab] = useState<Tab>((block.props.activeTab as Tab) || 'notes')
  const [elapsed, setElapsed] = useState(0)
  const [notes, setNotes] = useState(block.props.notes || '')
  const [errorMsg, setErrorMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeStamp, setActiveStamp] = useState('')
  const recorderRef = useRef<MicRecorder | null>(null)
  const wsPlayRef = useRef<WaveSurfer | null>(null)
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

  /* 点击时间戳跳转播放 */
  const seekToStamp = (stamp: string): void => {
    setActiveStamp(stamp)
    const ws = wsPlayRef.current
    if (!ws) return
    const parts = stamp.split(':').map(Number)
    let seconds = 0
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1]
    ws.setTime(seconds)
    ws.play()
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
        pageId: useAppStore.getState().currentId || '',
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
        setErrorMsg('转写结果为空(录音太短或引擎出错,请重试)')
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

  /* 导入音频文件 → 走同一管线 */
  const importAudio = async (): Promise<void> => {
    setRecStatus('importing')
    try {
      const imported = await window.oasis.system.importAudioFile()
      if (!imported) {
        setRecStatus('idle')
        return
      }
      setRecStatus('transcribing')
      const blob = new Blob([imported.buffer], { type: imported.mimeType })
      const { pcm, durationMs } = await decodeToPcm16kMono(blob)
      const recInfo = await window.oasis.recordings.save({
        pageId: useAppStore.getState().currentId || '',
        mimeType: imported.mimeType,
        durationMs,
        buffer: imported.buffer
      })
      updateProps({ status: 'transcribing', durationMs: String(durationMs), recordingId: recInfo.id })

      // 转写
      setActiveTab('transcript')
      const lang = localStorage.getItem('oasis.language') || 'auto'
      const transcript = await new Promise<string>((resolve) => {
        const unsub = window.oasis.on.recordingsChanged((r) => {
          if (r.id === recInfo.id && r.status === 'done') {
            unsub()
            resolve(r.transcript || '')
          }
          if (r.id === recInfo.id && r.status === 'error') {
            unsub()
            resolve(r.error || 'engine-error')
          }
        })
        void window.oasis.recordings.transcribe(recInfo.id, pcm, 16000, lang)
        // 90 秒超时
        setTimeout(() => { unsub(); resolve('') }, 90_000)
      })

      if (transcript) {
        updateProps({ transcript, status: 'summarizing' })
        setRecStatus('summarizing')
        const summary = await summarizeViaIpc(recInfo.id)
        updateProps({ summary, status: 'done' })
        setRecStatus('done')
        setActiveTab('summary')
      } else {
        updateProps({ status: 'error' })
        setRecStatus('error')
        setErrorMsg('转写结果为空(录音太短或引擎出错,请重试)')
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setRecStatus('error')
    }
  }

  /* 转写稿搜索过滤 */
  const transcriptMatches = (() => {
    if (!block.props.transcript) return []
    const q = searchQuery.trim().toLowerCase()
    return block.props.transcript.split(/\n{2,}/)
      .map((p) => {
        const m = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/.exec(p)
        return {
          stamp: m ? m[1] : '',
          text: m ? p.slice(m[0].length) : p,
          highlight: !!q && (m ? p.slice(m[0].length) : p).toLowerCase().includes(q)
        }
      })
      .filter((item) => !q || item.highlight)
  })()

  const isRecording = recStatus === 'recording' || recStatus === 'paused'
  const busy = recStatus === 'importing' || recStatus === 'transcribing' || recStatus === 'summarizing'
  const hasResult = !!(block.props.transcript || block.props.summary)

  return (
    <div className="meeting-console">
      {/* ─── 录音控制条 ─── */}
      <div className="console-bar">
        {/* 已有录音:显示回放播放器 */}
        {recStatus === 'done' && block.props.recordingId ? (
          <PlaybackPlayer recordingId={block.props.recordingId} onReady={(ws) => { wsPlayRef.current = ws }} />
        ) : null}

        <div className="console-controls">
          {/* 回放状态下也可以重新录音/导入 */}
          {recStatus === 'idle' || recStatus === 'error' ? (
            <>
              <button type="button" className="console-btn start" onClick={() => void startRec()}>
                <Icon name="mic" size={16} /> 开始录音
              </button>
              <button type="button" className="console-btn ghost" onClick={() => void importAudio()} title="导入音频文件(mp3/m4a/wav 等),自动转写并生成纪要">
                <Icon name="upload" size={14} /> 导入音频
              </button>
            </>
          ) : null}
          {recStatus === 'done' ? (
            <>
              <button type="button" className="console-btn ghost small" onClick={() => void startRec()}>
                <Icon name="mic" size={14} /> 重新录音
              </button>
              <button type="button" className="console-btn ghost small" onClick={() => void importAudio()}>
                <Icon name="upload" size={13} /> 导入音频
              </button>
            </>
          ) : null}
          {isRecording ? (
            <>
              <button type="button" className="console-icon-btn pause" onClick={togglePause} title={recStatus === 'paused' ? '继续' : '暂停'}>
                {recStatus === 'paused' ? <Icon name="play" size={14} /> : <Icon name="stop" size={14} />}
              </button>
              <button type="button" className="console-icon-btn stop" onClick={() => void stopRec()} title="结束录音">
                <Icon name="close" size={14} />
              </button>
            </>
          ) : null}
          {busy ? (
            <span className="console-status">
              <span className="spin" /> {recStatus === 'importing' ? '正在打开本地文件…' : recStatus === 'transcribing' ? '转写中…' : '生成纪要…'}
            </span>
          ) : null}
          {recStatus === 'error' ? <span className="console-error">{errorMsg}</span> : null}
        </div>
        {isRecording ? (
          <div className="console-live">
            <span className={`console-timer${recStatus === 'paused' ? ' paused' : ''}`}>{formatDuration(elapsed)}</span>
            <WaveCanvas recorder={recorderRef.current} active={recStatus === 'recording'} />
          </div>
        ) : null}
      </div>

      {/* ─── 标签页(录音前仅笔记;有结果后显示三标签) ─── */}
      <div className="console-tabs">
        {(hasResult ? TAB_LABELS : TAB_LABELS.filter((t) => t.key === 'notes')).map((t) => (
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
          <div className="numbered-notes">
            <div className="line-numbers">
              {Array.from({ length: Math.max(1, notes.split('\n').length) }, (_, i) => (
                <div key={i} className="line-num">{i + 1}.</div>
              ))}
            </div>
            <textarea
              className="console-notes numbered"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="点击此处开始记录…"
              rows={Math.max(4, notes.split('\n').length + 1)}
            />
          </div>
        ) : null}
        {activeTab === 'transcript' ? (
          <>
          <div className="console-search">
            <Icon name="search" size={14} />
            <input
              className="console-search-input"
              type="text"
              placeholder="搜索关键字…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <span className="console-search-count">
                {transcriptMatches.length} 处匹配
              </span>
            ) : null}
          </div>
          <div className="console-text">
            {block.props.transcript
              ? transcriptMatches.map(({ stamp, text, highlight }, i) => (
                  <div key={i} className="console-para-row">
                    {stamp ? (
                      <button type="button" className={`console-stamp clickable${activeStamp === stamp ? ' active' : ''}`} onClick={() => seekToStamp(stamp)} title="点击跳转播放">
                        {stamp}
                      </button>
                    ) : null}
                      <span
                      className="console-para-text"
                      dangerouslySetInnerHTML={{
                        __html: highlight
                          ? text.replace(
                              new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                              '<mark class="console-highlight">$1</mark>'
                            )
                          : text
                      }}
                    />
                    </div>
                  ))
              : busy ? <div className="console-loading"><div className="shimmer-line" style={{ width: '80%' }} /><div className="shimmer-line" style={{ width: '60%' }} /><div className="shimmer-line" style={{ width: '40%' }} /></div>
              : <span className="console-empty">录音完成后转写文稿会显示在这里</span>}
          </div>
          </>
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
    },
    content: 'none'
  },
  {
    render: (props) => <MeetingConsoleView block={props.block as never} />
  }
)
