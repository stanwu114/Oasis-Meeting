/** 用户数据保存位置:指针文件 + 启动时重定向 + 数据迁移。 */
import { app, dialog, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'

/** 指针文件固定在默认 userData 根目录(不随自定义路径走) */
const POINTER_NAME = 'data-location.json'

function defaultUserData(): string {
  return join(app.getPath('home'), 'Library', 'Application Support', 'Oasis Meeting')
}

function pointerPath(): string {
  return join(defaultUserData(), POINTER_NAME)
}

export interface DataLocationInfo {
  current: string
  isDefault: boolean
  totalBytes: number
}

/** 启动时调用(在 initDb 之前):读取指针并重定向 userData */
export function applyDataLocation(): void {
  try {
    const p = pointerPath()
    if (!existsSync(p)) return
    const info = JSON.parse(readFileSync(p, 'utf8')) as { path: string }
    if (info.path && info.path !== defaultUserData() && existsSync(info.path)) {
      app.setPath('userData', info.path)
      console.log(`[data-location] userData 重定向到: ${info.path}`)
    }
  } catch (e) {
    console.error('[data-location] 读取指针失败:', e)
  }
}

export async function getDataLocation(): Promise<DataLocationInfo> {
  const current = app.getPath('userData')
  const totalBytes = await dirSize(current)
  return { current, isDefault: current === defaultUserData(), totalBytes }
}

export async function chooseDataLocation(): Promise<{ path: string | null }> {
  const win = BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择数据保存位置'
  })
  if (result.canceled || result.filePaths.length === 0) return { path: null }
  return { path: result.filePaths[0] }
}

/** 迁移数据到新位置(关闭 db → 拷贝 → 重定向 → 重新初始化) */
export async function migrateDataLocation(
  newPath: string,
  onProgress: (pct: number, message: string) => void
): Promise<{ ok: boolean; message?: string }> {
  const oldPath = app.getPath('userData')
  if (newPath === oldPath) return { ok: false, message: '新位置与当前位置相同' }

  try {
    onProgress(0, '准备迁移…')

    /* 确保目标目录存在 */
    mkdirSync(newPath, { recursive: true })

    /* 1. 关闭数据库 */
    onProgress(5, '关闭数据库…')
    const { closeDb } = await import('./db')
    const { initDb } = await import('./db')
    closeDb()

    /* 2. 拷贝数据 */
    onProgress(10, '拷贝数据库…')
    for (const f of ['oasis.db', 'oasis.db-wal', 'oasis.db-shm']) {
      const src = join(oldPath, f)
      if (existsSync(src)) cpSync(src, join(newPath, f))
    }

    onProgress(30, '拷贝录音文件…')
    const mediaSrc = join(oldPath, 'media')
    if (existsSync(mediaSrc)) cpSync(mediaSrc, join(newPath, 'media'), { recursive: true })

    onProgress(60, '拷贝转写模型…')
    const modelSrc = join(oldPath, 'models')
    if (existsSync(modelSrc)) cpSync(modelSrc, join(newPath, 'models'), { recursive: true })

    onProgress(80, '拷贝备份…')
    const backupSrc = join(oldPath, 'backup')
    if (existsSync(backupSrc)) cpSync(backupSrc, join(newPath, 'backup'), { recursive: true })

    /* 3. 写指针 + 重定向 */
    onProgress(90, '切换到新位置…')
    mkdirSync(defaultUserData(), { recursive: true })
    writeFileSync(pointerPath(), JSON.stringify({ path: newPath, migratedAt: new Date().toISOString() }))
    app.setPath('userData', newPath)

    /* 4. 重新初始化 */
    onProgress(95, '重新初始化…')
    initDb()
    const { initMedia } = await import('./media')
    initMedia()

    /* 5. 验证新位置数据库可用 */
    const info = await getDataLocation()
    if (!info.current || !existsSync(join(newPath, 'oasis.db'))) {
      return { ok: false, message: '迁移后验证失败:新位置无数据库文件' }
    }

    onProgress(100, '迁移完成')
    return { ok: true }
  } catch (e) {
    /* 迁移失败:恢复指针到旧位置 */
    try {
      writeFileSync(pointerPath(), JSON.stringify({ path: oldPath }))
      app.setPath('userData', oldPath)
      const { initDb } = await import('./db')
      initDb()
    } catch { /* 尽力恢复 */ }
    return { ok: false, message: `迁移失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 重置到默认位置 */
export async function resetDataLocation(): Promise<{ ok: boolean; message?: string }> {
  const oldPath = app.getPath('userData')
  const defaultPath = defaultUserData()
  if (oldPath === defaultPath) return { ok: false, message: '已在默认位置' }
  return migrateDataLocation(defaultPath, () => undefined)
}

/** 目录大小(bytes) */
async function dirSize(dir: string): Promise<number> {
  const { readdir, stat } = await import('node:fs/promises')
  let total = 0
  async function walk(d: string): Promise<void> {
    try {
      const entries = await readdir(d, { withFileTypes: true })
      for (const e of entries) {
        const p = join(d, e.name)
        if (e.isDirectory()) await walk(p)
        else {
          const s = await stat(p)
          total += s.size
        }
      }
    } catch { /* 跳过不可读 */ }
  }
  await walk(dir)
  return total
}
