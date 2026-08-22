import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * dsh 历史会话列表:读取 DSH_HOME 会话存储
 * (~/.dsh/sessions/<工作区>/session-<uuid>/session.jsonl.zstd),
 * zstd 解压后取最后一条 session/title 事件作为标题。
 */

export interface HarnessSession {
  id: string
  title: string
  timeMs: number
  workspace: string
}

function decodeSlug(slug: string): string {
  return slug.replace(/^--|--$/g, '').replace(/--/g, '/')
}

export async function listHarnessSessions(): Promise<HarnessSession[]> {
  const root = join(homedir(), '.dsh', 'sessions')
  let workspaces: string[]
  try {
    workspaces = await readdir(root)
  } catch {
    return []
  }

  const sessions: HarnessSession[] = []
  const tasks: Promise<void>[] = []

  for (const ws of workspaces) {
    const wsDir = join(root, ws)
    let sessionDirs: string[]
    try {
      sessionDirs = await readdir(wsDir)
    } catch {
      continue
    }
    for (const s of sessionDirs) {
      if (!s.startsWith('session-')) continue
      tasks.push(
        (async () => {
          const file = join(wsDir, s, 'session.jsonl.zstd')
          try {
            const info = await stat(file)
            const id = s.slice('session-'.length)
            let title = ''
            let timeMs = info.mtimeMs
            try {
              const { stdout } = await execFileAsync('zstd', ['-dc', file], { maxBuffer: 32 * 1024 * 1024 })
              let lastTime = 0
              for (const line of stdout.split('\n')) {
                if (!line.includes('"session/title"')) continue
                try {
                  const ev = JSON.parse(line) as { time?: number; data?: { title?: string } }
                  if (typeof ev.time === 'number') lastTime = ev.time
                  if (ev.data?.title) title = ev.data.title
                } catch {
                  /* 跳过坏行 */
                }
              }
              if (lastTime > 0) timeMs = lastTime
            } catch {
              /* zstd 不可用或文件损坏 */
            }
            sessions.push({ id, title: title || '未命名会话', timeMs, workspace: decodeSlug(ws) })
          } catch {
            /* 文件缺失,跳过 */
          }
        })()
      )
    }
  }

  await Promise.all(tasks)
  sessions.sort((a, b) => b.timeMs - a.timeMs)
  return sessions.slice(0, 200)
}
