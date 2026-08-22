import { useEffect, useRef, useState } from 'react'
import { useRecorderStore, activeRecorder, getElapsed } from '../stores/recorderStore'
import { formatDuration } from '../audio/pcm'

/** 录音悬浮卡片:实时波形 + 计时 + 停止/取消 */
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
          ctx.fillStyle = style.getPropertyValue('--wave-progress').trim() || '#2383e2'
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
  }, [phase])

  if (phase === 'idle') return null

  return (
    <div className="recorder-overlay">
      <div className="recorder-card">
        {phase === 'requesting' ? <div className="recorder-status-text">正在请求麦克风权限…</div> : null}
        {phase === 'saving' ? <div className="recorder-status-text">正在保存并提交本地转写…</div> : null}
        {phase === 'error' ? <div className="recorder-status-text error">{error ?? '录音失败'}</div> : null}
        {phase === 'recording' ? (
          <>
            <div className="recorder-head">
              <span className="recorder-dot" />
              <Timer />
            </div>
            <canvas ref={canvasRef} className="recorder-canvas" />
            <div className="recorder-actions">
              <button type="button" className="btn ghost" onClick={() => useRecorderStore.getState().cancel()}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void useRecorderStore.getState().stop()}
              >
                ⏹ 停止并转写
              </button>
            </div>
          </>
        ) : null}
        {phase === 'error' ? (
          <div className="recorder-actions">
            <button type="button" className="btn ghost" onClick={() => useRecorderStore.getState().cancel()}>
              关闭
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void useRecorderStore.getState().start()}
            >
              重试
            </button>
          </div>
        ) : null}
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
  return <span className="recorder-time">{formatDuration(ms)}</span>
}
