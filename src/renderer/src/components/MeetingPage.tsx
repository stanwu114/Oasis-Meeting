import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatDuration, decodeToPcm16kMono } from '../audio/pcm'
import { MicRecorder } from '../audio/MicRecorder'
import fixWebmDuration from 'fix-webm-duration'
import WaveSurfer from 'wavesurfer.js'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { beijingStamp } from '../../../shared/ipc'

/**
 * Meeting 页面:纯表单结构(无 BlockNote)
 * 标题 + 导出按钮 + 会议信息卡 + 会议控制台
 */

/* ---------- 类型 ---------- */
interface MetaData {
  name: string
  location: string
  topic: string
  time: string
  participants: string
}

interface ConsoleData {
  notes: string
  transcript: string
  summary: string
  status: string
  recordingId: string
  durationMs: number
  activeTab: string
}

interface PageData {
  meta: MetaData
  console: ConsoleData
}

type Tab = 'notes' | 'transcript' | 'summary'
type RecStatus = 'idle' | 'recording' | 'paused' | 'importing' | 'transcribing' | 'summarizing' | 'done' | 'error'

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'notes', label: '会议笔记' },
  { key: 'transcript', label: '录音转写稿' },
  { key: 'summary', label: 'AI 会议纪要' }
]

const META_FIELDS: { key: keyof MetaData; label: string; placeholder: string }[] = [
  { key: 'name', label: '会议名称', placeholder: '录音转写后自动填写' },
  { key: 'location', label: '会议地点', placeholder: '自动定位中…' },
  { key: 'topic', label: '会议主题', placeholder: '填写本次会议主题' },
  { key: 'time', label: '会议时间', placeholder: '' },
  { key: 'participants', label: '参会人员', placeholder: '填写参会人员,顿号分隔' }
]

const emptyMeta: MetaData = { name: '', location: '', topic: '', time: '', participants: '' }
const emptyConsole: ConsoleData = { notes: '', transcript: '', summary: '', status: 'idle', recordingId: '', durationMs: 0, activeTab: 'notes' }

/* ---------- 会议信息卡 ---------- */
function MetaCard({ data, onChange }: { data: MetaData; onChange: (patch: Partial<MetaData>) => void }): React.ReactNode {
  return (
    <div className="meeting-meta">
      {META_FIELDS.map((f) => (
        <div key={f.key} className="meeting-meta-row">
          <span className="meeting-meta-label">{f.label}</span>
          <input
            className="meeting-meta-input"
            value={data[f.key]}
            placeholder={f.placeholder}
            readOnly={f.key === 'time'}
            onChange={(e) => onChange({ [f.key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  )
}

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
          for (let i = 0; i < view.length; i++) {
            const v = Math.max(0.04, Math.min(1, view[view.length - 1 - i]))
            const barH = v * h * 0.95
            const x = w - (i + 1) * (barW + gap)
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

/* ---------- 回放播放器 ---------- */
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
        progressColor: style.getPropertyValue('--accent').trim() || '#b45306',
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
export default function MeetingPage({ pageId }: { pageId: string }) {
  const title = useAppStore((s) => s.currentTitle)

  const [meta, setMeta] = useState<MetaData>(emptyMeta)
  const [consoleData, setConsoleData] = useState<ConsoleData>(emptyConsole)
  const [recStatus, setRecStatus] = useState<RecStatus>('idle')
  const [activeTab, setActiveTab] = useState<Tab>('notes')
  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeStamp, setActiveStamp] = useState('')
  const [summaryEditing, setSummaryEditing] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')
  const highlightQuery = useUiStore((s) => s.highlightQuery)

  const recorderRef = useRef<MicRecorder | null>(null)
  const wsPlayRef = useRef<WaveSurfer | null>(null)
  const timerRef = useRef<number | null>(null)
  const saveTimer = useRef<number | null>(null)
  const namedRef = useRef(false)

  /* ---------- 数据持久化 ---------- */
  const saveData = (m: MetaData, c: ConsoleData): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void window.oasis.pages.updateContent(pageId, { meta: m, console: c } as never)
    }, 600)
  }

  const updateMeta = (patch: Partial<MetaData>): void => {
    setMeta((prev) => {
      const next = { ...prev, ...patch }
      saveData(next, consoleData)
      return next
    })
  }

  const updateConsole = (patch: Partial<ConsoleData>): void => {
    setConsoleData((prev) => {
      const next = { ...prev, ...patch }
      saveData(meta, next)
      return next
    })
  }

  /* ---------- 加载页面数据 ---------- */
  useEffect(() => {
    void window.oasis.pages.get(pageId).then((page) => {
      if (!page?.content) return
      const content = page.content as unknown as PageData
      if (content.meta) setMeta({ ...emptyMeta, ...content.meta })
      if (content.console) {
        setConsoleData({ ...emptyConsole, ...content.console })
        setRecStatus((content.console.status as RecStatus) || 'idle')

        // 搜索高亮:检查哪个标签页包含搜索词,自动切换过去
        const hq = useUiStore.getState().highlightQuery
        if (hq) {
          const q = hq.toLowerCase()
          if (content.console.transcript?.toLowerCase().includes(q)) {
            setActiveTab('transcript')
            setSearchQuery(hq)
          } else if (content.console.summary?.toLowerCase().includes(q)) {
            setActiveTab('summary')
          } else if (content.console.notes?.toLowerCase().includes(q)) {
            setActiveTab('notes')
          }
          useUiStore.getState().setHighlightQuery('') // 用完清空
        }
      }
    })
  }, [pageId])

  /* ---------- 自动定位:macOS CoreLocation(系统定位) + 反向地理编码 ---------- */
  useEffect(() => {
    if (meta.location) return
    let cancelled = false

    // 1. 用系统定位获取经纬度(触发 macOS 定位权限弹窗)
    const getCoords = (): Promise<{ lat: number; lng: number } | null> =>
      new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(null)
          return
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null), // 定位被拒绝或失败
          { timeout: 8000, enableHighAccuracy: true }
        )
      })

    // 2. 反向地理编码:经纬度 → 中文地址
    const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
      try {
        const res = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`,
          { signal: AbortSignal.timeout(5000) }
        )
        const data = (await res.json()) as {
          locality?: string
          city?: string
          principalSubdivision?: string
          countryName?: string
        }
        const parts = [data.countryName, data.principalSubdivision, data.city || data.locality]
          .filter((x, i, a) => x && a.indexOf(x) === i)
        return parts.join(' ')
      } catch {
        return ''
      }
    }

    // 3. 优先系统定位,失败则回退 IP 定位
    void (async () => {
      const coords = await getCoords()
      if (cancelled) return

      if (coords) {
        const address = await reverseGeocode(coords.lat, coords.lng)
        if (cancelled) return
        if (address) {
          updateMeta({ location: address })
          return
        }
      }

      // 回退:IP 粗定位
      const loc = await window.oasis.system.getCityLocation()
      if (cancelled || !loc) return
      const place = [loc.country, loc.region, loc.city].filter((x, i, a) => x && a.indexOf(x) === i).join(' ')
      updateMeta({ location: place })
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  /* ---------- AI 自动命名+主题 ---------- */
  useEffect(() => {
    if (namedRef.current || meta.name || !consoleData.transcript) return
    namedRef.current = true
    void window.oasis.ai.meetingName(consoleData.transcript).then(({ name, topic }) => {
      if (name) {
        updateMeta({ name, topic: topic || meta.topic })
        void useAppStore.getState().renamePage(pageId, `${name}会议@${meta.time || beijingStamp()}`)
      }
    }).catch(() => { namedRef.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleData.transcript, pageId])

  /* ---------- 录音控制 ---------- */
  const startTimer = (): void => {
    timerRef.current = window.setInterval(() => {
      if (recorderRef.current) setElapsed(recorderRef.current.elapsedMs)
    }, 200)
  }
  const stopTimer = (): void => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

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

  const summarizeViaIpc = async (recordingId: string): Promise<string> => {
    return new Promise<string>((resolve) => {
      const unsub = window.oasis.on.recordingsChanged((r) => {
        if (r.id === recordingId && r.summaryStatus === 'done') { unsub(); resolve(r.summary || '') }
        if (r.id === recordingId && r.summaryStatus === 'error') { unsub(); resolve('') }
      })
      void window.oasis.recordings.summarize(recordingId)
    })
  }

  const processAudio = async (pcm: Int16Array, recInfo: { id: string }): Promise<void> => {
    setRecStatus('transcribing')
    updateConsole({ status: 'transcribing', recordingId: recInfo.id })
    const lang = localStorage.getItem('oasis.language') || 'auto'
    const transcript = await new Promise<string>((resolve) => {
      const unsub = window.oasis.on.recordingsChanged((r) => {
        if (r.id === recInfo.id && r.status === 'done') { unsub(); resolve(r.transcript || '') }
        if (r.id === recInfo.id && r.status === 'error') { unsub(); resolve('') }
      })
      void window.oasis.recordings.transcribe(recInfo.id, pcm, 16000, lang)
      setTimeout(() => { unsub(); resolve('') }, 90_000)
    })
    if (transcript) {
      updateConsole({ transcript, status: 'summarizing' })
      setRecStatus('summarizing')
      const summary = await summarizeViaIpc(recInfo.id)
      updateConsole({ summary, status: 'done' })
      setRecStatus('done')
      setActiveTab('summary')
    } else {
      updateConsole({ status: 'error' })
      setRecStatus('error')
      setErrorMsg('转写结果为空(录音太短或引擎出错)')
    }
  }

  const stopRec = async (): Promise<void> => {
    const rec = recorderRef.current
    if (!rec) return
    stopTimer()
    try {
      const { blob, durationMs } = await rec.stop()
      recorderRef.current = null
      let fixed = blob
      if (blob.type.includes('webm') && durationMs > 0) {
        try { fixed = await fixWebmDuration(blob, durationMs) } catch { /* ignore */ }
      }
      const { pcm } = await decodeToPcm16kMono(fixed)
      const buffer = await fixed.arrayBuffer()
      const recInfo = await window.oasis.recordings.save({
        pageId, mimeType: fixed.type || 'audio/webm', durationMs, buffer
      })
      updateConsole({ durationMs })
      await processAudio(pcm, recInfo)
    } catch (e) {
      recorderRef.current?.cancel()
      recorderRef.current = null
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setRecStatus('error')
    }
  }

  const importAudio = async (): Promise<void> => {
    setRecStatus('importing')
    try {
      const imported = await window.oasis.system.importAudioFile()
      if (!imported) { setRecStatus('idle'); return }
      setRecStatus('transcribing')
      const blob = new Blob([imported.buffer], { type: imported.mimeType })
      const { pcm, durationMs } = await decodeToPcm16kMono(blob)
      const recInfo = await window.oasis.recordings.save({
        pageId, mimeType: imported.mimeType, durationMs, buffer: imported.buffer
      })
      updateConsole({ durationMs })
      await processAudio(pcm, recInfo)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setRecStatus('error')
    }
  }

  /* ---------- 导出 ---------- */
  const exportMeeting = async (): Promise<void> => {
    try {
      const path = await window.oasis.ai.exportMeeting({
        title: useAppStore.getState().currentTitle || '未命名会议',
        meetingName: meta.name || title,
        time: meta.time,
        location: meta.location,
        topic: meta.topic,
        participants: meta.participants,
        summary: consoleData.summary
      })
      if (path) useUiStore.getState().showToast(`已导出到 ${path}`)
    } catch (e) {
      useUiStore.getState().showToast(`导出失败:${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  /* ---------- 时间戳跳转 ---------- */
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

  /* ---------- 清理 ---------- */
  useEffect(() => {
    return () => {
      stopTimer()
      recorderRef.current?.cancel()
    }
  }, [])

  /* ---------- 渲染 ---------- */
  const isRecording = recStatus === 'recording' || recStatus === 'paused'
  const busy = recStatus === 'importing' || recStatus === 'transcribing' || recStatus === 'summarizing'
  const hasResult = !!(consoleData.transcript || consoleData.summary)

  /* 转写稿搜索过滤 */
  const transcriptMatches = (() => {
    if (!consoleData.transcript) return []
    const q = searchQuery.trim().toLowerCase()
    return consoleData.transcript.split(/\n{2,}/)
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

  /* 标题 */
  const titleTimer = useRef<number | null>(null)
  const onTitleInput = (value: string): void => {
    useAppStore.getState().setCurrentTitleLocal(value)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => {
      void useAppStore.getState().renamePage(pageId, value.trim())
    }, 500)
  }

  return (
    <div className="editor-page">
      {/* 标题 */}
      <textarea
        className="page-title"
        value={title}
        placeholder="无标题"
        rows={1}
        onChange={(e) => onTitleInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault() } }}
      />

      {/* 导出按钮 */}
      <div className="export-row">
        <button type="button" className="page-ai-btn" onClick={() => void exportMeeting()}>
          导出 Meeting
        </button>
      </div>

      {/* 会议信息卡(不可删除) */}
      <MetaCard data={meta} onChange={updateMeta} />

      {/* 会议控制台(不可删除) */}
      <div className="meeting-console">
        {/* 录音控制条 */}
        <div className="console-bar">
          {recStatus === 'done' && consoleData.recordingId ? (
            <PlaybackPlayer recordingId={consoleData.recordingId} onReady={(ws) => { wsPlayRef.current = ws }} />
          ) : null}
          <div className="console-controls">
            {recStatus === 'idle' || recStatus === 'error' ? (
              <>
                <button type="button" className="console-btn start" onClick={() => void startRec()}>
                  <Icon name="mic" size={16} /> 开始录音
                </button>
                <button type="button" className="console-btn ghost" onClick={() => void importAudio()}>
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
                <button type="button" className="console-icon-btn pause" onClick={togglePause}>
                  {recStatus === 'paused' ? <Icon name="play" size={14} /> : <Icon name="stop" size={14} />}
                </button>
                <button type="button" className="console-icon-btn stop" onClick={() => void stopRec()}>
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
              <span className="console-timer">{formatDuration(elapsed)}</span>
              <WaveCanvas recorder={recorderRef.current} active={recStatus === 'recording'} />
            </div>
          ) : null}
        </div>

        {/* 标签页 */}
        <div className="console-tabs">
          {(hasResult ? TAB_LABELS : TAB_LABELS.filter((t) => t.key === 'notes')).map((t) => (
            <button key={t.key} type="button" className={`console-tab${activeTab === t.key ? ' on' : ''}`} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="console-content">
          {activeTab === 'notes' ? (
            <div className="numbered-notes">
              <div className="line-numbers">
                {Array.from({ length: Math.max(1, consoleData.notes.split('\n').length) }, (_, i) => (
                  <div key={i} className="line-num">{i + 1}.</div>
                ))}
              </div>
              <textarea
                className="console-notes numbered"
                value={consoleData.notes}
                onChange={(e) => updateConsole({ notes: e.target.value })}
                placeholder="点击此处开始记录…"
                rows={Math.max(4, consoleData.notes.split('\n').length + 1)}
              />
            </div>
          ) : null}

          {activeTab === 'transcript' ? (
            <>
              <div className="console-search">
                <Icon name="search" size={14} />
                <input
                  className="console-search-input"
                  placeholder="搜索关键字…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery ? <span className="console-search-count">{transcriptMatches.length} 处匹配</span> : null}
              </div>
              <div className="console-text">
                {transcriptMatches.length > 0 ? (
                  transcriptMatches.map(({ stamp, text }, i) => (
                    <div key={i} className="console-para-row">
                      {stamp ? (
                        <button
                          type="button"
                          className={`console-stamp clickable${activeStamp === stamp ? ' active' : ''}`}
                          onClick={() => seekToStamp(stamp)}
                        >
                          {stamp}
                        </button>
                      ) : null}
                      <span
                        className="console-para-text"
                        dangerouslySetInnerHTML={{
                          __html: searchQuery.trim()
                            ? text.replace(
                                new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                '<mark class="console-highlight">$1</mark>'
                              )
                            : text
                        }}
                      />
                    </div>
                  ))
                ) : busy ? (
                  <div className="console-loading">
                    <div className="shimmer-line" style={{ width: '80%' }} />
                    <div className="shimmer-line" style={{ width: '60%' }} />
                    <div className="shimmer-line" style={{ width: '40%' }} />
                  </div>
                ) : (
                  <span className="console-empty">录音完成后转写文稿会显示在这里</span>
                )}
              </div>
            </>
          ) : null}

          {activeTab === 'summary' ? (
            <>
              {consoleData.summary && !summaryEditing ? (
                <div className="summary-toolbar">
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setSummaryDraft(consoleData.summary)
                      setSummaryEditing(true)
                    }}
                  >
                    编辑纪要
                  </button>
                </div>
              ) : null}
              {summaryEditing ? (
                <>
                  <div className="summary-toolbar">
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() => {
                        setSummaryEditing(false)
                        updateConsole({ summary: summaryDraft })
                      }}
                    >
                      完成
                    </button>
                  </div>
                  <textarea
                    className="console-notes summary-edit"
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    rows={Math.max(8, summaryDraft.split('\n').length + 1)}
                    placeholder="编辑会议纪要内容…"
                    autoFocus
                  />
                </>
              ) : (
                <div className="console-text summary-body">
                  {consoleData.summary ? (
                    consoleData.summary.split('\n').map((line, i) => {
                      const t = line.trim()
                      if (!t) return null
                      // 高亮搜索词
                      const hl = (text: string): React.ReactNode => {
                        const hq = highlightQuery || searchQuery
                        if (!hq || !hq.trim()) return text
                        try {
                          const regex = new RegExp(`(${hq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
                          const parts = text.split(regex)
                          if (parts.length <= 1) return text
                          return parts.map((part, j) =>
                            regex.test(part) ? (
                              <mark key={j} className="console-highlight">{part}</mark>
                            ) : (
                              <span key={j}>{part}</span>
                            )
                          )
                        } catch {
                          return text
                        }
                      }
                      if (t.startsWith('## ')) {
                        return (
                          <div key={i} className="console-heading-section">
                            <span className="console-heading-bar" />
                            <span className="console-heading">{hl(t.slice(3))}</span>
                          </div>
                        )
                      }
                      if (/^[-*]\s/.test(t)) {
                        return (
                          <div key={i} className="console-bullet">
                            <span className="console-dot" />
                            <span>{hl(t.replace(/^[-*]\s/, ''))}</span>
                          </div>
                        )
                      }
                      return <p key={i} className="console-para">{hl(t)}</p>
                    })
                  ) : busy ? (
                    <div className="console-loading">
                      <div className="shimmer-line" style={{ width: '70%' }} />
                      <div className="shimmer-line" style={{ width: '85%' }} />
                      <div className="shimmer-line" style={{ width: '50%' }} />
                    </div>
                  ) : (
                    <span className="console-empty">录音完成后 AI 会议纪要会显示在这里</span>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
