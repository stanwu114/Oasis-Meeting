import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatDuration } from '../audio/pcm'
import { beijingStamp } from '../../../shared/ipc'
import type { MicRecorder } from '../audio/MicRecorder'
import WaveSurfer from 'wavesurfer.js'
import { useAppStore } from '../stores/appStore'
import { useUiStore } from '../stores/uiStore'
import { useRecordingStore } from '../stores/recordingStore'

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
  { key: 'summary', label: 'AI 会议纪要' },
  { key: 'transcript', label: '录音转写稿' },
  { key: 'notes', label: '会议笔记' }
]

const META_FIELDS: { key: keyof MetaData; label: string; placeholder: string }[] = [
  { key: 'name', label: '会议名称', placeholder: '录音转写后自动填写' },
  { key: 'location', label: '会议地点', placeholder: '自动定位中…' },
  { key: 'topic', label: '会议主题', placeholder: '填写本次会议主题' },
  { key: 'time', label: '会议时间', placeholder: '' },
  { key: 'participants', label: '参会人员', placeholder: '填写参会人员,顿号分隔' }
]

const emptyMeta: MetaData = { name: '', location: '', topic: '', time: '', participants: '' }
const emptyConsole: ConsoleData = { notes: '', transcript: '', summary: '', status: 'idle', recordingId: '', durationMs: 0, activeTab: 'summary' }

/* ---------- 会议信息卡 ---------- */
function MetaCard({
  data,
  onChange,
  highlightQuery
}: {
  data: MetaData
  onChange: (patch: Partial<MetaData>) => void
  highlightQuery: string
}): React.ReactNode {
  const hq = highlightQuery.trim().toLowerCase()
  return (
    <div className="meeting-meta">
      {META_FIELDS.map((f) => {
        const value = data[f.key] || ''
        const isMatch = !!hq && value.toLowerCase().includes(hq)
        return (
          <div key={f.key} className={`meeting-meta-row${isMatch ? ' field-hit' : ''}`}>
            <span className="meeting-meta-label">{f.label}</span>
            <input
              className={`meeting-meta-input${isMatch ? ' field-highlight' : ''}`}
              value={value}
              placeholder={f.placeholder}
              readOnly={f.key === 'time'}
              onChange={(e) => onChange({ [f.key]: e.target.value })}
            />
          </div>
        )
      })}
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
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [errorMsg, setErrorMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeStamp, setActiveStamp] = useState('')
  const [summaryEditing, setSummaryEditing] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')
  const highlightQuery = useUiStore((s) => s.highlightQuery)

  const dataLoadedRef = useRef(false)
  const namedRef = useRef(false)
  const consoleDataRef = useRef<ConsoleData>(emptyConsole)
  const metaRef = useRef<MetaData>(emptyMeta)
  const wsPlayRef = useRef<WaveSurfer | null>(null)
  const saveTimer = useRef<number | null>(null)

  /* 同步 ref(避免闭包捕获旧值) */
  consoleDataRef.current = consoleData
  metaRef.current = meta

  /* ---------- 数据持久化 ---------- */
  /* 防抖保存:完整数据(含转写稿/纪要/笔记)都存入 JSON,独立列同步写 */
  const saveData = (m: MetaData, c: ConsoleData): void => {
    if (!dataLoadedRef.current) return
    /* 隔离突变:构造保存副本,不 mutate 传入的 c(它同时是 React 新 state) */
    const toSave: ConsoleData = { ...c }
    /* 只保护流水线产出字段(后台录音管线写入,UI 不应覆盖);
       notes/summary 是用户可编辑字段,主动清空是合法操作,不做回填 */
    const prev = consoleDataRef.current
    if (!toSave.recordingId && prev.recordingId) toSave.recordingId = prev.recordingId
    if (!toSave.durationMs && prev.durationMs) toSave.durationMs = prev.durationMs
    if (!toSave.transcript && prev.transcript) toSave.transcript = prev.transcript
    if (!toSave.status || toSave.status === 'idle') if (prev.status && prev.status !== 'idle') toSave.status = prev.status
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void window.oasis.pages.get(pageId).then((fresh) => {
        const fc = (fresh?.content as unknown as { console?: Partial<ConsoleData> } | null)?.console
        if (fc) {
          if (!toSave.transcript && fc.transcript) toSave.transcript = fc.transcript
          if (!toSave.recordingId && fc.recordingId) toSave.recordingId = fc.recordingId
          if (!toSave.durationMs && fc.durationMs) toSave.durationMs = fc.durationMs
          if (fc.status === 'done') toSave.status = 'done'
        }
        void window.oasis.pages.updateContent(pageId, { meta: m, console: toSave } as never)
      })
    }, 600)
  }

  /* 关键数据立即保存(转写稿/纪要/笔记 — 不走防抖) */
  const saveConsoleNow = (fields: { transcript?: string; summary?: string; notes?: string }): void => {
    if (!dataLoadedRef.current) return
    void window.oasis.pages.updateConsole(pageId, fields)
  }

  const updateMeta = (patch: Partial<MetaData>): void => {
    setMeta((prev) => {
      const next = { ...prev, ...patch }
      metaRef.current = next
      saveData(next, consoleDataRef.current)
      return next
    })
    // 会议名称改动 → 同步页面标题(侧边栏/页面顶端随之更新)
    const name = patch.name?.trim()
    if (name) {
      const oldTitle = useAppStore.getState().currentTitle
      const at = oldTitle.indexOf('@')
      const suffix = at > 0 ? oldTitle.slice(at) : `@${metaRef.current.time || beijingStamp()}`
      const base = name.endsWith('会议') ? name : `${name}会议`
      const newTitle = `${base}${suffix}`
      if (newTitle !== oldTitle) void useAppStore.getState().renamePage(pageId, newTitle)
    }
  }

  const updateConsole = (patch: Partial<ConsoleData>): void => {
    setConsoleData((prev) => {
      const next = { ...prev, ...patch }
      // 大字段立即保存
      const immediate: { transcript?: string; summary?: string; notes?: string } = {}
      if (patch.transcript !== undefined) immediate.transcript = patch.transcript
      if (patch.summary !== undefined) immediate.summary = patch.summary
      if (patch.notes !== undefined) immediate.notes = patch.notes
      if (Object.keys(immediate).length > 0) saveConsoleNow(immediate)
      // 状态字段防抖保存
      saveData(meta, next)
      return next
    })
  }

  /* ---------- 加载页面数据 ---------- */
  useEffect(() => {
    dataLoadedRef.current = false // 切页时重置
    void window.oasis.pages.get(pageId).then((page) => {
      dataLoadedRef.current = true // 数据已加载,允许保存
      if (!page?.content) return
      const content = page.content as unknown as PageData
      if (content.meta) setMeta({ ...emptyMeta, ...content.meta })
      if (content.console) {
        setConsoleData({ ...emptyConsole, ...content.console })
        // 全局录音/处理正进行且属于本页时,以全局状态为准(库里的旧 status 不能覆盖)
        const gs = useRecordingStore.getState()
        if (gs.pageId === pageId && gs.phase && gs.phase !== 'done' && gs.phase !== 'error') {
          setRecStatus(gs.phase as RecStatus)
        } else {
          setRecStatus((content.console.status as RecStatus) || 'idle')
        }

        // 校验录音文件是否存在
        const recId = (content.console as unknown as Record<string, unknown>)?.recordingId as string
        if (recId) {
          void window.oasis.recordings.readAudio(recId).then((buf) => {
            if (!buf) {
              // 文件丢失,清除回放引用但保留文稿
              setConsoleData((prev) => ({ ...prev, recordingId: '' }))
              setRecStatus((prev) => (prev === 'done' ? 'idle' : prev))
            }
          })
        }

        // 搜索高亮:检查哪个标签页包含搜索词,自动切换过去
        const hq = useUiStore.getState().highlightQuery
        if (hq) {
          const q = hq.toLowerCase()
          // 检查所有内容(含 meta 字段)
          const inTranscript = content.console.transcript?.toLowerCase().includes(q)
          const inSummary = content.console.summary?.toLowerCase().includes(q)
          const inNotes = content.console.notes?.toLowerCase().includes(q)
          if (inTranscript) {
            setActiveTab('transcript')
            setSearchQuery(hq)
          } else if (inSummary) {
            setActiveTab('summary')
            setSearchQuery(hq)
          } else if (inNotes) {
            setActiveTab('notes')
          }
          // 不清除 highlightQuery,让它持续用于高亮(切页或新搜索时由 SearchResults 清除)
        }
      }
    })
  }, [pageId])

  /* ---------- 自动定位:macOS CoreLocation(系统定位) + 反向地理编码 ----------
   * 只在页面数据加载完 且 地点为空 时才定位,已有地点(包括录音后)永不覆盖 */
  useEffect(() => {
    if (meta.location) return
    if (!dataLoadedRef.current) return // 等页面数据加载完再判断(防止空默认值误触发)
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
  }, [pageId, meta.location, dataLoadedRef.current])

  /* 补漏:页面已加载但高亮词后到的情况 */
  useEffect(() => {
    if (!highlightQuery || !dataLoadedRef.current) return
    const q = highlightQuery.toLowerCase()
    const cd = consoleDataRef.current
    if (cd.transcript?.toLowerCase().includes(q)) {
      setActiveTab('transcript')
      setSearchQuery(highlightQuery)
    } else if (cd.summary?.toLowerCase().includes(q)) {
      setActiveTab('summary')
      setSearchQuery(highlightQuery)
    } else if (cd.notes?.toLowerCase().includes(q)) {
      setActiveTab('notes')
    }
  }, [highlightQuery])

  /* 切页时清除高亮 */
  useEffect(() => {
    return () => {
      useUiStore.getState().setHighlightQuery('')
      setSearchQuery('')
    }
  }, [pageId])

  /* ---------- AI 自动命名+主题 ---------- */
  useEffect(() => {
    if (namedRef.current || meta.name || !consoleData.transcript) return
    namedRef.current = true
    void window.oasis.ai.meetingName(consoleData.transcript).then(({ name, topic }) => {
      if (name) {
        updateMeta({ name, topic: topic || meta.topic })
      }
    }).catch(() => { namedRef.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleData.transcript, pageId])

  /* ---------- 录音控制:全局管理器(切页不中断) ---------- */
  const recPhase = useRecordingStore((st) => st.phase)
  const recPageId = useRecordingStore((st) => st.pageId)
  const recElapsed = useRecordingStore((st) => st.elapsedMs)
  const recError = useRecordingStore((st) => st.errorMsg)
  const mineRecording = recPageId === pageId
  const elapsed = mineRecording ? recElapsed : 0

  /* 全局流水线状态 → 本页 UI;完成/失败时重载本页数据 */
  useEffect(() => {
    if (!mineRecording) return
    if (recPhase === 'recording' || recPhase === 'paused' || recPhase === 'importing' || recPhase === 'transcribing' || recPhase === 'summarizing') {
      setRecStatus(recPhase)
      return
    }
    if (recPhase === 'done') {
      setRecStatus('done')
      void window.oasis.pages.get(pageId).then((page) => {
        const content = page?.content as unknown as { console?: Partial<ConsoleData> } | null
        if (content?.console) setConsoleData({ ...emptyConsole, ...content.console })
        setActiveTab('summary')
        useUiStore.getState().showToast('录音处理完成,AI 纪要已生成')
      })
    }
    if (recPhase === 'error') {
      setRecStatus('error')
      setErrorMsg(recError || '录音处理失败')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recPhase, mineRecording, recError])

  const startRec = async (): Promise<void> => {
    try {
      const pageTitle = metaRef.current.name || useAppStore.getState().currentTitle || '会议'
      await useRecordingStore.getState().start(pageId, pageTitle)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setRecStatus('error')
    }
  }

  const togglePause = (): void => {
    useRecordingStore.getState().togglePause()
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

  /* 手动重新生成纪要(有转写稿时) */
  const generateSummary = async (): Promise<void> => {
    const rid = consoleDataRef.current.recordingId
    if (!rid) return
    setRecStatus('summarizing')
    updateConsole({ status: 'summarizing' })
    const summary = await summarizeViaIpc(rid)
    if (summary) {
      updateConsole({ summary, status: 'done' })
    } else {
      updateConsole({ status: 'done' })
      setErrorMsg('AI 纪要生成失败,请检查「设置 → AI 总结模型配置」')
    }
    setRecStatus('done')
  }

  const stopRec = async (): Promise<void> => {
    await useRecordingStore.getState().stop()
  }

  const importAudio = async (): Promise<void> => {
    try {
      const imported = await window.oasis.system.importAudioFile()
      if (!imported) return
      const blob = new Blob([imported.buffer], { type: imported.mimeType })
      const pageTitle = metaRef.current.name || useAppStore.getState().currentTitle || '会议'
      await useRecordingStore.getState().importBlob(pageId, pageTitle, blob)
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
        const text = m ? p.slice(m[0].length) : p
        return {
          stamp: m ? m[1] : '',
          text,
          highlight: !!q && text.toLowerCase().includes(q)
        }
      })
      // 有搜索词时仍然显示全部行(不过滤),只是高亮命中的;用户可以手动在搜索栏过滤
      .filter((item) => !q || item.highlight || true)
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
      <MetaCard data={meta} onChange={updateMeta} highlightQuery={highlightQuery} />

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
              <WaveCanvas recorder={mineRecording && (recPhase === 'recording' || recPhase === 'paused') ? useRecordingStore.getState().getRecorder() : null} active={recStatus === 'recording'} />
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
              {searchQuery.trim() && consoleData.notes ? (
                /* 搜索模式下:只读高亮视图 */
                <div className="console-notes-view">
                  {consoleData.notes.split('\n').map((line, i) => (
                    <div key={i} className="notes-line">
                      {(() => {
                        const q = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                        const parts = line.split(new RegExp(`(${q})`, 'gi'))
                        return parts.map((part, j) =>
                          part.toLowerCase() === searchQuery.toLowerCase()
                            ? <mark key={j} className="console-highlight">{part}</mark>
                            : <span key={j}>{part || '\u00A0'}</span>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  className="console-notes numbered"
                  value={consoleData.notes}
                  onChange={(e) => updateConsole({ notes: e.target.value })}
                  placeholder="点击此处开始记录…"
                  rows={Math.max(4, consoleData.notes.split('\n').length + 1)}
                />
              )}
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
                      <span className="console-para-text">
                        {searchQuery.trim()
                          ? (() => {
                              const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                              const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
                              return parts.map((part, j) =>
                                part.toLowerCase() === searchQuery.toLowerCase()
                                  ? <mark key={j} className="console-highlight">{part}</mark>
                                  : <span key={j}>{part}</span>
                              )
                            })()
                          : text
                        }
                      </span>
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
                  ) : consoleData.transcript ? (
                    <div className="summary-generate">
                      <button type="button" className="btn primary small" onClick={() => void generateSummary()}>
                        生成 AI 纪要
                      </button>
                      <span className="console-empty">基于转写文稿生成,模型在「设置 → AI 总结模型配置」中管理</span>
                    </div>
                  ) : (
                    <span className="console-empty">先完成录音转写,再在这里生成 AI 纪要</span>
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
