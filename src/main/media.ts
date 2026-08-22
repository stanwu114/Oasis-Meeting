import { app, net, protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MEDIA_SCHEME = 'oasis-media'

let mediaDir = ''

export function initMedia(): void {
  mediaDir = join(app.getPath('userData'), 'media')
  void mkdir(mediaDir, { recursive: true })
}

/** 只允许简单的文件名,杜绝路径穿越 */
const SAFE_NAME = /^[\w][\w.-]*$/

export function mediaUrl(fileName: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(fileName)}`
}

export function mediaPath(fileName: string): string {
  return join(mediaDir, fileName)
}

/** audio/webm;codecs=opus → audio/webm */
export function normalizeMime(mimeType: string): string {
  return (mimeType.split(';')[0] || 'application/octet-stream').trim().toLowerCase()
}

const MIME_EXT: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac'
}

/** 扩展名 → 响应 Content-Type */
const EXT_MIME: Record<string, string> = {
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  bin: 'application/octet-stream'
}

export async function saveAudioFile(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const ext = MIME_EXT[normalizeMime(mimeType)] ?? '.bin'
  const name = `${randomUUID()}${ext}`
  const file = mediaPath(name)
  await new Promise<void>((resolvePromise, reject) => {
    const ws = createWriteStream(file)
    ws.on('error', reject)
    ws.on('finish', () => resolvePromise())
    ws.end(Buffer.from(buffer))
  })
  return name
}

export async function deleteAudioFile(fileName: string): Promise<void> {
  if (!SAFE_NAME.test(fileName)) return
  await rm(mediaPath(fileName), { force: true })
}

/** 在 app ready 之前调用 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
    }
  ])
}

/** 在 app ready 之后调用 */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!SAFE_NAME.test(name)) return new Response('bad request', { status: 400 })
    const file = resolve(mediaDir, name)
    if (!file.startsWith(resolve(mediaDir))) return new Response('forbidden', { status: 403 })

    const response = await net.fetch(pathToFileURL(file).toString())
    // 渲染进程(file:// 源)需要 CORS 头才能 fetch 自定义协议
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const contentType = EXT_MIME[ext]
    if (contentType) headers.set('Content-Type', contentType)
    return new Response(response.body, { status: response.status, headers })
  })
}

export async function readAudioBytes(fileName: string): Promise<Buffer | null> {
  if (!SAFE_NAME.test(fileName)) return null
  try {
    const { readFile } = await import('node:fs/promises')
    return await readFile(mediaPath(fileName))
  } catch {
    return null
  }
}

export async function fileExistsAndLargerThan(path: string, bytes: number): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile() && s.size > bytes
  } catch {
    return false
  }
}
