import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'

/**
 * dsh 必须用系统 Node 运行:Electron 内置 Node 解析不了 vendor/profile 里
 * 安装的包。GUI 应用的 PATH 通常不含 Homebrew,因此显式探测常见位置。
 */
export function resolveNodeBinary(): { cmd: string; env: NodeJS.ProcessEnv } {
  const candidates: string[] = []
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir) candidates.push(join(dir, 'node'))
  }
  candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/opt/local/bin/node')
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return { cmd: candidate, env: {} }
    } catch {
      /* 下一个 */
    }
  }
  return { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
}
