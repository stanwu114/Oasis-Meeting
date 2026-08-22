import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveNodeBinary } from './nodeRuntime'

/**
 * DeepSeek Harness (dsh) 运行器:以子进程启动 `dsh web`(仅绑回环地址),
 * 从 stdout 解析端口,状态经事件广播。优先使用项目根目录的 deepseek-harness
 * 检出(用户维护),缺失时回退 vendor 副本。
 */
export interface HarnessState {
  status: 'unavailable' | 'stopped' | 'starting' | 'ready' | 'error'
  url: string | null
  error: string | null
}

let child: ChildProcess | null = null
let state: HarnessState = { status: 'stopped', url: null, error: null }
let startPromise: Promise<HarnessState> | null = null
let listeners: ((s: HarnessState) => void)[] = []

export function dshRoot(): string | null {
  const appRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const primary = join(appRoot, 'deepseek-harness')
  const fallback = join(appRoot, 'vendor', 'deepseek-harness')
  for (const dir of [primary, fallback]) {
    if (existsSync(join(dir, 'apps', 'cli', 'lib', 'bin.js'))) return dir
  }
  return null
}

function setState(patch: Partial<HarnessState>): void {
  state = { ...state, ...patch }
  for (const fn of listeners) fn(state)
}

export function onHarnessState(fn: (s: HarnessState) => void): void {
  listeners.push(fn)
}

export function getHarnessState(): HarnessState {
  if (state.status === 'stopped' && !dshRoot()) return { status: 'unavailable', url: null, error: null }
  return state
}

export async function startHarness(): Promise<HarnessState> {
  const root = dshRoot()
  if (!root) {
    setState({ status: 'unavailable' })
    return state
  }
  if (state.status === 'ready' || state.status === 'starting') return startPromise ?? state
  startPromise = (async () => {
    stopHarness()
    setState({ status: 'starting', url: null, error: null })
    const node = resolveNodeBinary()
    return new Promise<HarnessState>((resolve) => {
      const childProc = spawn(
        node.cmd,
        [join(root, 'apps', 'cli', 'lib', 'bin.js'), '--profile', 'web', '--port', '0', '--host', '127.0.0.1'],
        {
          env: {
            ...process.env,
            ...node.env,
            DSH_HOME: process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh')
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: root
        }
      )
      child = childProc

      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        setState({ status: 'error', error: '启动超时(60 秒)' })
        stopHarness()
        resolve(state)
      }, 60_000)

      const finish = (s: HarnessState): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        setState(s)
        resolve(state)
      }

      childProc.stdout?.on('data', (chunk: Buffer) => {
        const m = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/.exec(chunk.toString())
        if (m) finish({ status: 'ready', url: `http://127.0.0.1:${m[1]}`, error: null })
      })
      childProc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        // BRAVE_API_KEY 等可选插件告警不算错误
        if (!text.includes('BRAVE_API_KEY')) console.log('[dsh]', text.trim().slice(0, 400))
      })
      childProc.on('exit', (code) => {
        if (!settled) finish({ status: 'error', url: null, error: `dsh 进程退出(code ${code})` })
        else if (state.status === 'ready') setState({ status: 'stopped', url: null })
      })
      childProc.on('error', (e) => finish({ status: 'error', url: null, error: e.message }))
    })

    startPromise = null
    return state
  })()
  return startPromise
}

export function stopHarness(): void {
  if (child) {
    child.removeAllListeners()
    child.stdout?.removeAllListeners()
    child.stderr?.removeAllListeners()
    child.kill('SIGTERM')
    child = null
  }
  if (state.status === 'ready' || state.status === 'starting') {
    setState({ status: 'stopped', url: null })
  }
}
