import { app } from 'electron'
import { copyFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 每日自动备份:数据库 + 媒体文件清单
 * 保留最近 7 份,自动轮转
 */

const BACKUP_DIR = () => join(app.getPath('userData'), 'backup')
const DB_PATH = () => join(app.getPath('userData'), 'oasis.db')
const MEDIA_DIR = () => join(app.getPath('userData'), 'media')
const MAX_BACKUPS = 7

export async function runDailyBackup(): Promise<void> {
  const backupDir = BACKUP_DIR()
  await mkdir(backupDir, { recursive: true })

  // 检查今天是否已备份
  const today = new Date().toISOString().slice(0, 10) // yyyy-mm-dd
  const existing = await readdir(backupDir)
  const todayBackup = existing.find((f) => f.startsWith(today))
  if (todayBackup) return // 今天已备份

  // 备份数据库
  const dbBackup = join(backupDir, `${today}-oasis.db`)
  try {
    await copyFile(DB_PATH(), dbBackup)
  } catch {
    // WAL 模式下直接复制可能不完整,用 checkpoint 后重试
    return
  }

  // 备份媒体文件清单
  try {
    const mediaFiles = await readdir(MEDIA_DIR())
    const manifest = {
      date: today,
      files: mediaFiles.map((f) => f),
    }
    await writeFile(join(backupDir, `${today}-media.json`), JSON.stringify(manifest, null, 2))
  } catch {
    /* media 目录可能不存在 */
  }

  // 轮转:删除最旧的备份
  const allBackups = (await readdir(backupDir)).filter((f) => f.endsWith('-oasis.db')).sort()
  while (allBackups.length > MAX_BACKUPS) {
    const oldest = allBackups.shift()
    if (!oldest) break
    await unlink(join(backupDir, oldest)).catch(() => undefined)
    await unlink(join(backupDir, oldest.replace('-oasis.db', '-media.json'))).catch(() => undefined)
  }
}

/**
 * 清理孤儿音频文件:media 目录中不被任何 recording 引用的文件
 */
export async function cleanOrphanMedia(getReferencedFiles: () => string[]): Promise<number> {
  try {
    const mediaFiles = await readdir(MEDIA_DIR())
    const referenced = new Set(getReferencedFiles())
    let cleaned = 0
    for (const f of mediaFiles) {
      if (!referenced.has(f)) {
        await unlink(join(MEDIA_DIR(), f)).catch(() => undefined)
        cleaned++
      }
    }
    return cleaned
  } catch {
    return 0
  }
}
