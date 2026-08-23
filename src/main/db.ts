import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { extractDocText, makeSnippet } from '../shared/extract'
import type {
  BlockDoc,
  PageDetail,
  PageSummary,
  RecordingInfo,
  RecordingListEntry,
  SearchResult,
  TranscribeStatus
} from '../shared/ipc'

let db: DB

export function initDb(): void {
  const file = join(app.getPath('userData'), 'oasis.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
}

export function closeDb(): void {
  try {
    db?.close()
  } catch {
    /* noop */
  }
}

function migrate(): void {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0
  if (version < 1) {
    db.exec(`
      CREATE TABLE pages (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '无标题',
        icon TEXT,
        sort_order REAL NOT NULL DEFAULT 1024,
        content TEXT,
        body_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        deleted_at TEXT
      );
      CREATE INDEX idx_pages_parent ON pages(parent_id, sort_order) WHERE deleted_at IS NULL;

      CREATE TABLE recordings (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        block_id TEXT,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'audio/webm',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        transcript TEXT,
        language TEXT NOT NULL DEFAULT 'auto',
        engine TEXT NOT NULL DEFAULT 'sensevoice',
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_recordings_page ON recordings(page_id);

      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
    db.pragma('user_version = 1')
  }
  if (version < 2) {
    db.exec(`
      ALTER TABLE recordings ADD COLUMN summary TEXT;
      ALTER TABLE recordings ADD COLUMN summary_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE recordings ADD COLUMN summary_error TEXT;
    `)
    db.pragma('user_version = 2')
  }
  if (version < 3) {
    db.exec(`
      CREATE TABLE ai_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '新对话',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id, created_at);
    `)
    db.pragma('user_version = 3')
  }
  if (version < 4) {
    db.exec(`ALTER TABLE ai_conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';`)
    db.pragma('user_version = 4')
  }
  if (version < 5) {
    db.exec(`
      ALTER TABLE pages ADD COLUMN transcript TEXT DEFAULT '';
      ALTER TABLE pages ADD COLUMN summary TEXT DEFAULT '';
      ALTER TABLE pages ADD COLUMN notes TEXT DEFAULT '';
    `)
    db.pragma('user_version = 5')
  }
}

/* ---------- 行映射 ---------- */

interface PageRow {
  id: string
  parent_id: string | null
  title: string
  icon: string | null
  sort_order: number
  content: string | null
  body_text: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  transcript?: string
  summary?: string
  notes?: string
  child_count?: number
}

function toSummary(r: PageRow): PageSummary {
  return {
    id: r.id,
    parentId: r.parent_id,
    title: r.title,
    icon: r.icon,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    childCount: r.child_count ?? 0
  }
}

function toDetail(r: PageRow): PageDetail {
  const content = r.content ? (JSON.parse(r.content) as Record<string, unknown>) : null
  // 合并独立列到 console 数据(v5 迁移后 transcript/summary/notes 存独立列)
  if (content && typeof content === 'object' && 'console' in content) {
    const consoleData = content.console as Record<string, unknown>
    if (r.transcript) consoleData.transcript = r.transcript
    if (r.summary) consoleData.summary = r.summary
    if (r.notes) consoleData.notes = r.notes
  }
  return { ...toSummary(r), content: content as unknown as BlockDoc }
}

interface RecRow {
  id: string
  page_id: string
  block_id: string | null
  file_name: string
  mime_type: string
  duration_ms: number
  transcript: string | null
  summary: string | null
  summary_status: string
  summary_error: string | null
  language: string
  engine: string
  status: string
  error: string | null
  created_at: string
}

function toRecording(r: RecRow): RecordingInfo {
  return {
    id: r.id,
    pageId: r.page_id,
    blockId: r.block_id,
    fileName: r.file_name,
    mimeType: r.mime_type,
    durationMs: r.duration_ms,
    transcript: r.transcript,
    summary: r.summary,
    summaryStatus: r.summary_status as RecordingInfo['summaryStatus'],
    summaryError: r.summary_error,
    language: r.language,
    engine: r.engine,
    status: r.status as TranscribeStatus,
    error: r.error,
    createdAt: r.created_at
  }
}

/* ---------- 页面 ---------- */

const CHILD_COUNT_SQL = `(SELECT COUNT(*) FROM pages c WHERE c.parent_id = p.id AND c.deleted_at IS NULL)`

export function listPages(): PageSummary[] {
  const rows = db
    .prepare(
      `SELECT p.*, ${CHILD_COUNT_SQL} AS child_count
       FROM pages p WHERE p.deleted_at IS NULL ORDER BY p.sort_order, p.created_at`
    )
    .all() as PageRow[]
  return rows.map(toSummary)
}

export function listTrash(): PageSummary[] {
  const rows = db
    .prepare(`SELECT p.*, 0 AS child_count FROM pages p WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC`)
    .all() as PageRow[]
  return rows.map(toSummary)
}

export function getPage(id: string): PageDetail | null {
  const row = db.prepare(`SELECT p.*, 0 AS child_count FROM pages p WHERE p.id = ?`).get(id) as PageRow | undefined
  return row ? toDetail(row) : null
}

export function createPage(parentId: string | null, title?: string): PageDetail {
  const id = randomUUID()
  const next = nextSort(parentId)
  db.prepare(
    `INSERT INTO pages (id, parent_id, title, sort_order) VALUES (?, ?, ?, ?)`
  ).run(id, parentId, title ?? '无标题', next)
  return getPage(id)!
}

function nextSort(parentId: string | null): number {
  const row = parentId
    ? db.prepare(`SELECT MAX(sort_order) AS m FROM pages WHERE parent_id = ? AND deleted_at IS NULL`).get(parentId)
    : db.prepare(`SELECT MAX(sort_order) AS m FROM pages WHERE parent_id IS NULL AND deleted_at IS NULL`).get()
  return ((row as { m: number | null }).m ?? 0) + 1024
}

export function renamePage(id: string, title: string): void {
  db.prepare(`UPDATE pages SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(title, id)
}

export function setIcon(id: string, icon: string | null): void {
  db.prepare(`UPDATE pages SET icon = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(icon, id)
}

export function updateContent(id: string, content: BlockDoc): void {
  const body = extractDocText(content)
  db.prepare(
    `UPDATE pages SET content = ?, body_text = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(JSON.stringify(content), body, id)
}

/** 计算目标位置的分段排序值(不做全量重排) */
function sortAt(parentId: string | null, index: number, excludeId: string): number {
  const rows = (
    parentId
      ? db.prepare(`SELECT sort_order FROM pages WHERE parent_id = ? AND deleted_at IS NULL AND id != ? ORDER BY sort_order`)
      : db.prepare(`SELECT sort_order FROM pages WHERE parent_id IS NULL AND deleted_at IS NULL AND id != ? ORDER BY sort_order`)
  ).all(...(parentId ? [parentId, excludeId] : [excludeId])) as { sort_order: number }[]
  const before = index > 0 ? rows[index - 1]?.sort_order : undefined
  const after = index < rows.length ? rows[index]?.sort_order : undefined
  if (before !== undefined && after !== undefined) return (before + after) / 2
  if (after !== undefined) return after - 1024
  if (before !== undefined) return before + 1024
  return 1024
}

function isDescendant(candidateId: string, ancestorId: string): boolean {
  let cur: string | null = candidateId
  const stmt = db.prepare(`SELECT parent_id FROM pages WHERE id = ?`)
  for (let i = 0; i < 100 && cur; i++) {
    if (cur === ancestorId) return true
    cur = (stmt.get(cur) as { parent_id: string | null } | undefined)?.parent_id ?? null
  }
  return false
}

export function movePage(id: string, parentId: string | null, index: number): void {
  const page = getPage(id)
  if (!page) throw new Error('页面不存在')
  if (parentId) {
    if (parentId === id) throw new Error('不能移动到自身')
    if (isDescendant(parentId, id)) throw new Error('不能移动到自己的子页面中')
    if (!getPage(parentId)) throw new Error('目标页面不存在')
  }
  db.prepare(`UPDATE pages SET parent_id = ?, sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .run(parentId, sortAt(parentId, index, id), id)
}

/** 递归收集 id 及所有后代 */
function collectTree(id: string): string[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE tree(x) AS (SELECT ? UNION ALL SELECT c.id FROM pages c JOIN tree t ON c.parent_id = t.x)
       SELECT x FROM tree`
    )
    .all(id) as { x: string }[]
  return rows.map((r) => r.x)
}

export function trashPage(id: string): void {
  const ids = collectTree(id)
  const stmt = db.prepare(`UPDATE pages SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL`)
  for (const i of ids) stmt.run(i)
}

export function restorePage(id: string): void {
  const page = getPage(id)
  if (!page) return
  // 父页面不存在或仍在回收站时,恢复到顶层
  let parentId = page.parentId
  if (parentId) {
    const p = db.prepare(`SELECT deleted_at FROM pages WHERE id = ?`).get(parentId) as
      | { deleted_at: string | null }
      | undefined
    if (!p || p.deleted_at !== null) parentId = null
  }
  db.prepare(`UPDATE pages SET deleted_at = NULL, parent_id = ?, sort_order = ? WHERE id = ?`).run(
    parentId,
    nextSort(parentId),
    id
  )
}

/** 彻底删除,返回需要清理的音频文件名列表 */
export function deletePagePermanent(id: string): string[] {
  const ids = collectTree(id)
  const files: string[] = []
  const recStmt = db.prepare(`SELECT file_name FROM recordings WHERE page_id = ?`)
  for (const i of ids) {
    const recs = recStmt.all(i) as { file_name: string }[]
    files.push(...recs.map((r) => r.file_name))
  }
  const del = db.prepare(`DELETE FROM pages WHERE id = ?`)
  for (const i of ids) del.run(i)
  return files
}

/* ---------- 搜索 ---------- */

export function searchPages(q: string): SearchResult[] {
  const term = `%${q.replace(/([%_\\])/g, '\\$1')}%`
  const rows = db
    .prepare(
      `SELECT DISTINCT id, title, icon, body_text,
              COALESCE(transcript, '') as col_transcript,
              COALESCE(summary, '') as col_summary,
              COALESCE(notes, '') as col_notes
       FROM pages
       WHERE deleted_at IS NULL AND (
         title LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR body_text LIKE ? ESCAPE '\\'
         OR COALESCE(transcript, '') LIKE ? ESCAPE '\\'
         OR COALESCE(summary, '') LIKE ? ESCAPE '\\'
         OR COALESCE(notes, '') LIKE ? ESCAPE '\\'
         OR COALESCE(content, '') LIKE ? ESCAPE '\\'
       )
       ORDER BY updated_at DESC LIMIT 50`
    )
    .all(term, term, term, term, term, term) as {
      id: string; title: string; icon: string | null; body_text: string;
      col_transcript: string; col_summary: string; col_notes: string
    }[]
  return rows.map((r) => {
    // 用所有文本源拼出完整的搜索文本(保证 snippet 能找到)
    const fullText = [r.body_text, r.col_transcript, r.col_summary, r.col_notes]
      .filter(Boolean).join('\n')
    return { pageId: r.id, title: r.title, icon: r.icon, snippet: makeSnippet(fullText, q) }
  })
}

/* ---------- 录音 ---------- */

export function createRecording(input: {
  pageId: string
  fileName: string
  mimeType: string
  durationMs: number
  language: string
}): RecordingInfo {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO recordings (id, page_id, file_name, mime_type, duration_ms, language, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).run(id, input.pageId, input.fileName, input.mimeType, input.durationMs, input.language)
  return getRecording(id)!
}

export function getRecording(id: string): RecordingInfo | null {
  const row = db.prepare(`SELECT * FROM recordings WHERE id = ?`).get(id) as RecRow | undefined
  return row ? toRecording(row) : null
}

export function listRecordingsByPage(pageId: string): RecordingInfo[] {
  const rows = db.prepare(`SELECT * FROM recordings WHERE page_id = ? ORDER BY created_at`).all(pageId) as RecRow[]
  return rows.map(toRecording)
}

export function listAllRecordings(): RecordingListEntry[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.page_id, p.title AS page_title, r.duration_ms, r.status, r.error, r.transcript, r.created_at
       FROM recordings r JOIN pages p ON p.id = r.page_id
       WHERE p.deleted_at IS NULL
       ORDER BY r.created_at DESC LIMIT 200`
    )
    .all() as {
    id: string
    page_id: string
    page_title: string
    duration_ms: number
    status: string
    error: string | null
    transcript: string | null
    created_at: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    pageId: r.page_id,
    pageTitle: r.page_title,
    durationMs: r.duration_ms,
    status: r.status as TranscribeStatus,
    error: r.error,
    transcriptPreview: (r.transcript ?? '').replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, '').replace(/\n+/g, ' ').slice(0, 120),
    createdAt: r.created_at
  }))
}

export function updateConsoleFields(
  id: string,
  fields: { transcript?: string; summary?: string; notes?: string }
): void {
  const sets: string[] = []
  const vals: unknown[] = []
  if (fields.transcript !== undefined) { sets.push('transcript = ?'); vals.push(fields.transcript) }
  if (fields.summary !== undefined) { sets.push('summary = ?'); vals.push(fields.summary) }
  if (fields.notes !== undefined) { sets.push('notes = ?'); vals.push(fields.notes) }
  if (sets.length === 0) return
  sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
  vals.push(id)
  db.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function setRecordingBlock(id: string, blockId: string | null): void {
  db.prepare(`UPDATE recordings SET block_id = ? WHERE id = ?`).run(blockId, id)
}

export function setRecordingStatus(id: string, status: TranscribeStatus, error: string | null = null): void {
  db.prepare(`UPDATE recordings SET status = ?, error = ? WHERE id = ?`).run(status, error, id)
}

export function setRecordingTranscript(id: string, transcript: string, language: string): void {
  db.prepare(
    `UPDATE recordings SET transcript = ?, language = ?, status = 'done', error = NULL, summary_status = 'pending', summary = NULL WHERE id = ?`
  ).run(transcript, language, id)
}

export function setSummaryStatus(id: string, status: 'pending' | 'summarizing' | 'done' | 'error', error: string | null = null): void {
  db.prepare(`UPDATE recordings SET summary_status = ?, summary_error = ? WHERE id = ?`).run(status, error, id)
}

export function setSummaryText(id: string, summary: string): void {
  db.prepare(`UPDATE recordings SET summary = ?, summary_status = 'done', summary_error = NULL WHERE id = ?`).run(summary, id)
}

/* ---------- 设置 ---------- */

export function getAllRecordingFileNames(): string[] {
  const rows = db.prepare(`SELECT file_name FROM recordings`).all() as { file_name: string }[]
  return rows.map((r) => r.file_name)
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value)
}
