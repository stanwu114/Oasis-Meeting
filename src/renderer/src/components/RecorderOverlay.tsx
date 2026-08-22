import { useEffect, useRef, useState } from 'react'
import { useRecorderStore, activeRecorder, getElapsed } from '../stores/recorderStore'
import { formatDuration } from '../audio/pcm'

/** 录音悬浮 HUD:置顶胶囊(红点 + 计时 + 实时波形 + 停止) */
export function RecorderOverlay() {
  const phase = useRecorderStore((s) => s.phase)
  const error = useRecorderStore((s) => s.error)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (phase !== 'recording') return
    let raf = 0
    const draw = (): void => {
      const canvas = canvasRef.current
      const recorder = activeRecorder()
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
          ctx.fillStyle = style.getPropertyValue('--danger').trim() || '#eb5757'
          const barW = 3
          const gap = 2
          const count = Math.max(1, Math.floor(w / (barW + gap)))
          const view = levels.slice(-count)
          const x0 = w - view.length * (barW + gap)
          for (let i = 0; i < view.length; i++) {
            const v = Math.max(0.08, Math.min(1, view[i]))
            const barH = v * h * 0.95
            ctx.fillRect(x0 + i * (barW + gap), (h - barH) / 2, barW, barH)
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  if (phase === 'idle') return null

  if (phase === 'requesting') {
    return (
      <div className="hud-center">
        <div className="hud-pill">
          <span className="hud-hint">正在请求麦克风权限…</span>
        </div>
      </div>
    )
  }

  if (phase === 'saving') {
    return (
      <div className="hud-center">
        <div className="hud-pill">
          <span className="spin hud-spin" />
          <span className="hud-hint">正在保存并提交本地转写…</span>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="hud-center">
        <div className="hud-pill error">
          <span className="hud-error-text">{error ?? '录音失败'}</span>
          <span className="hud-divider" />
          <button type="button" className="hud-btn" onClick={() => useRecorderStore.getState().cancel()}>
            关闭
          </button>
          <button type="button" className="hud-btn primary" onClick={() => void useRecorderStore.getState().start()}>
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="hud-center">
      <div className="hud-pill recording">
        <span className="hud-dot" />
        <span className="hud-timer">
          <Timer />
        </span>
        <canvas ref={canvasRef} className="hud-canvas" />
        <span className="hud-divider" />
        <button type="button" className="hud-btn" onClick={() => useRecorderStore.getState().cancel()}>
          取消
        </button>
        <button type="button" className="hud-btn stop" onClick={() => void useRecorderStore.getState().stop()}>
          ⏹ 停止并转写
        </button>
      </div>
    </div>
  )
}

function Timer(): React.ReactNode {
  const [ms, setMs] = useState(getElapsed())
  useEffect(() => {
    const t = window.setInterval(() => setMs(getElapsed()), 200)
    return () => window.clearInterval(t)
  }, [])
  return <>{formatDuration(ms)}</>
}
