/**
 * 把任意音频 Blob 解码为 16kHz 单声道 Int16 PCM —— SenseVoice 的输入格式。
 * 利用 Chromium 内置解码器,无需 ffmpeg:webm/opus、mp3、m4a、wav 等均可。
 */
export async function decodeToPcm16kMono(
  blob: Blob
): Promise<{ pcm: Int16Array; durationMs: number; sampleRate: 16000 }> {
  const arrayBuffer = await blob.arrayBuffer()
  // OfflineAudioContext 会把解码结果重采样到 context 的 sampleRate
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: 16000 })
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))

  const channels = buffer.numberOfChannels
  const len = buffer.length
  const mono = new Float32Array(len)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels
  }

  const pcm = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    const v = Math.max(-1, Math.min(1, mono[i]))
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff
  }
  return { pcm, durationMs: Math.round(buffer.duration * 1000), sampleRate: 16000 }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
