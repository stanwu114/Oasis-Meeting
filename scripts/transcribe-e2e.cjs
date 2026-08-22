// 端到端验证:下载 SenseVoice 模型 → 用 macOS say 合成中文语音 → 本地识别 → 打印结果
// 模型存到应用 userData,与正式应用共用
const { app } = require('electron')
const { execFile } = require('node:child_process')
const { createWriteStream, existsSync, statSync, renameSync } = require('node:fs')
const { join } = require('node:path')
const { promisify } = require('node:util')
const execFileAsync = promisify(execFile)

const HF_BASE =
  'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main'
const FILES = [
  { name: 'model.int8.onnx', minBytes: 200 * 1024 * 1024 },
  { name: 'tokens.txt', minBytes: 1000 }
]

function modelDir() {
  return join(app.getPath('userData'), 'models', 'sensevoice')
}

async function downloadFile(name) {
  const url = `${HF_BASE}/${name}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`下载 ${name} 失败: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  let got = 0
  const part = join(modelDir(), `${name}.part`)
  const ws = createWriteStream(part)
  for await (const chunk of res.body) {
    got += chunk.byteLength
    if (ws.write(chunk) === false) await new Promise((r) => ws.once('drain', r))
    if (total > 0 && got % (20 * 1024 * 1024) < chunk.byteLength) {
      console.log(`  ${name}: ${(got / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`)
    }
  }
  await new Promise((r) => ws.end(r))
  renameSync(part, join(modelDir(), name))
  console.log(`  ${name}: 完成 (${(got / 1024 / 1024).toFixed(1)} MB)`)
}

/** 解析 WAV,返回 Int16 PCM */
function wavToPcm(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('不是 WAV 文件')
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'data') {
      return new Int16Array(buffer.buffer, buffer.byteOffset + offset + 8, Math.floor(size / 2)).slice()
    }
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV 中未找到 data 块')
}

app.whenReady().then(async () => {
  try {
    console.log('[1/3] 准备模型…')
    if (!existsSync(modelDir())) require('node:fs').mkdirSync(modelDir(), { recursive: true })
    for (const f of FILES) {
      const p = join(modelDir(), f.name)
      const ok = existsSync(p) && statSync(p).size >= f.minBytes
      if (!ok) await downloadFile(f.name)
      else console.log(`  ${f.name}: 已存在`)
    }

    console.log('[2/3] 合成中文测试语音…')
    const wavPath = '/tmp/oasis-e2e.wav'
    // 注意:必须用明确的中文音色(如 Tingting);默认/部分新音色读中文会产生空壳或伪语音
    await execFileAsync('say', [
      '-v', 'Tingting',
      '大家好,欢迎使用本地绿洲笔记软件,录音转写功能完全在本地运行,不会上传任何数据。',
      '--data-format=LEI16@16000', '-o', wavPath
    ])
    const wav = require('node:fs').readFileSync(wavPath)
    const pcm = wavToPcm(wav)
    console.log(`  语音时长: ${(pcm.length / 16000).toFixed(1)} 秒`)

    console.log('[3/3] SenseVoice 本地识别…')
    const sherpa = require('sherpa-onnx-node')
    const recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: {
          model: join(modelDir(), 'model.int8.onnx'),
          language: 'auto',
          useInverseTextNormalization: true
        },
        tokens: join(modelDir(), 'tokens.txt'),
        numThreads: 4,
        provider: 'cpu',
        debug: false
      }
    })
    const t0 = Date.now()
    const stream = recognizer.createStream()
    const samples = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768
    stream.acceptWaveform({ sampleRate: 16000, samples })
    recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    const text = String(result.text || '').replace(/<\|[^|]*\|>/g, '').trim()
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2)
    console.log('---')
    console.log(`识别结果: ${text}`)
    console.log(`耗时: ${elapsed}s(音频 ${(pcm.length / 16000).toFixed(1)}s)`)
    console.log('---')
    app.exit(text.length > 0 ? 0 : 1)
  } catch (e) {
    console.error('[e2e] 失败:', e)
    app.exit(1)
  }
})
