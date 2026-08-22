import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { formatDuration } from '../audio/pcm'
import { Icon } from '../components/Icon'

/** 基于 wavesurfer.js 的音频播放器(只读波形 + 播放/暂停) */
export function AudioPlayer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const style = getComputedStyle(document.documentElement)
    const wave = style.getPropertyValue('--wave').trim() || '#d3d3d1'
    const progress = style.getPropertyValue('--wave-progress').trim() || '#2383e2'

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      height: 36,
      waveColor: wave,
      progressColor: progress,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      cursorWidth: 0,
      normalize: true
    })
    wsRef.current = ws
    ws.on('ready', () => {
      setDuration(ws.getDuration())
      setCurrent(0)
    })
    ws.on('timeupdate', (t: number) => setCurrent(t))
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))
    ws.on('error', () => setError('音频加载失败'))

    return () => {
      ws.destroy()
      wsRef.current = null
    }
  }, [url])

  return (
    <div className="audio-player">
      <button
        type="button"
        className="audio-play-btn"
        onClick={() => wsRef.current?.playPause()}
        aria-label={playing ? '暂停' : '播放'}
      >
        <Icon name={playing ? 'stop' : 'play'} size={12} />
      </button>
      <div className="audio-wave" ref={containerRef} />
      <span className="audio-time">
        {error ?? `${formatDuration(current * 1000)} / ${formatDuration(duration * 1000)}`}
      </span>
    </div>
  )
}
