import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * DeepSeek Harness (dsh) 运行器:以子进程方式启动 `dsh web`,
 * 从 stdout 解析实际端口,通过事件向渲染进程广播状态。
 */
export type DshStatus = 'unavailable' | 'stopped' | 'starting' | 'ready' | 'error'

export interface DshState {
  status: DshStatus
  url: string | null
  error: string | null
}

let child: ChildProcess | null = null
let state: DshState = { status: 'stopped', url: null, error: null }
let startPromise: Promise<DshState> | null = null
let listeners: ((s: DshState) => void)[] = []

export function dshVendorAvailable(): boolean {
  const bin = dshBinPath()
  return existsSync(bin)
}

function dshBinPath(): string {
  const vendor = app.isPackaged
    ? join(process.resourcesPath, 'vendor', 'deepseek-harness')
    : join(app.getAppPath(), 'vendor', 'deepseek-harness')
  return join(vendor, 'apps', 'cli', 'lib', 'bin.js')
}

function setState(patch: Partial<DshState>): void {
  state = { ...state, ...patch }
  for (const fn of listeners) fn(state)
}

export function onDshState(fn: (s: DshState) => void): void {
  listeners.push(fn)
}

export function getDshState(): DshState {
  if (state.status === 'stopped' && !dshVendorAvailable()) {
    return { status: 'unavailable', url: null, error: null }
  }
  return state
}

export async function startDsh(): Promise<DshState> {
  if (!dshVendorAvailable()) {
    setState({ status: 'unavailable' })
    return state
  }
  if (state.status === 'ready' || state.status === 'starting') {
    return startPromise ?? state
  }
  startPromise = (async () => {
    stopDsh()
    setState({ status: 'starting', url: null, error: null })

    return new Promise<DshState>((resolve) => {
      const childProc = spawn(process.execPath, [dshBinPath(), '--profile', 'web', '--port', '0', '--host', '127.0.0.1'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh') },
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: join(dshBinPath(), '..', '..', '..', '..')
      })
      child = childProc

      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        setState({ status: 'error', error: '启动超时(40 秒)' })
        stopDsh()
        resolve(state)
      }, 40_000)

      const finish = (s: DshState): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        setState(s)
        resolve(state)
      }

      // dsh web 就绪后在 stdout 打印一行:dsh web: http://127.0.0.1:<port>
      const onStdout = (chunk: Buffer): void => {
        const text = chunk.toString()
        const m = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/.exec(text)
        if (m) {
          finish({ status: 'ready', url: `http://127.0.0.1:${m[1]}`, error: null })
        }
      }
      childProc.stdout?.on('data', onStdout)
      childProc.stderr?.on('data', (chunk: Buffer) => {
        // BRAVE_API_KEY 等可选插件警告不算错误
        const text = chunk.toString()
        if (!text.includes('BRAVE_API_KEY')) console.log('[dsh]', text.trim())
      })
      childProc.on('exit', (code) => {
        if (!settled) {
          finish({ status: 'error', url: null, error: `dsh 进程退出(code ${code})` })
        } else if (state.status === 'ready') {
          // 运行中意外退出
          setState({ status: 'stopped', url: null, error: null })
        }
      })
      childProc.on('error', (e) => {
        finish({ status: 'error', url: null, error: e.message })
      })
    })

    startPromise = null
    return state
  })()
  return startPromise
}

export function stopDsh(): void {
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
