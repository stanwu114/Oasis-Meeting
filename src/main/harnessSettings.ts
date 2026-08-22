import { readFileSync, writeFileSync } from 'node:fs'
import { readdir, readFile, rm, cp, mkdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

/**
 * Harness 设置:读写 ~/.dsh 的配置,统一收进应用设置面板。
 * - settings.yaml 的 agent-default-model(默认模型/推理强度)
 * - .credentials.yaml 的 DEEPSEEK_API_KEY
 * - skills/ 目录的技能管理
 */

export interface HarnessSettings {
  provider: string
  model: string
  reasoningEffort: string
}

export interface HarnessSkill {
  id: string
  name: string
  description: string
}

function settingsPath(): string {
  return join(homedir(), '.dsh', 'settings.yaml')
}

function credentialsPath(): string {
  return join(homedir(), '.dsh', '.credentials.yaml')
}

function skillsDir(): string {
  return join(homedir(), '.dsh', 'skills')
}

export function getHarnessSettings(): HarnessSettings | null {
  let text: string
  try {
    text = readFileSync(settingsPath(), 'utf8')
  } catch {
    return null
  }
  const provider = /^\s*provider:\s*(\S+)/m.exec(text)?.[1] ?? 'deepseek-official'
  const model = /^\s*model:\s*(\S+)/m.exec(text)?.[1] ?? 'deepseek-v4-pro'
  const effort = /^\s*reasoningEffort:\s*(\S+)/m.exec(text)?.[1] ?? 'high'
  return { provider, model, reasoningEffort: effort }
}

export function setHarnessSettings(patch: { model?: string; reasoningEffort?: string }): HarnessSettings {
  const path = settingsPath()
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    text = ''
  }

  const current = getHarnessSettings() ?? { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' }
  const next: HarnessSettings = {
    provider: current.provider,
    model: patch.model ?? current.model,
    reasoningEffort: patch.reasoningEffort ?? current.reasoningEffort
  }

  const block = `agent-default-model:\n  provider: ${next.provider}\n  model: ${next.model}\n  reasoningEffort: ${next.reasoningEffort}\n`
  if (/^agent-default-model:\n(  .+\n)+/m.test(text)) {
    text = text.replace(/^agent-default-model:\n(  .+\n)+/m, block)
  } else {
    text = `${text.trimEnd()}\n\n${block}`
  }
  writeFileSync(path, text, 'utf8')
  return next
}

/* ---------- API Key ---------- */

export function getHarnessApiKey(): { hasKey: boolean; masked: string | null } {
  try {
    const text = readFileSync(credentialsPath(), 'utf8')
    const key = /^\s*DEEPSEEK_API_KEY:\s*["']?([\w-]+)["']?\s*$/m.exec(text)?.[1]
    if (!key) return { hasKey: false, masked: null }
    return { hasKey: true, masked: `${key.slice(0, 5)}…${key.slice(-4)}` }
  } catch {
    return { hasKey: false, masked: null }
  }
}

export function setHarnessApiKey(key: string | null): { hasKey: boolean; masked: string | null } {
  const path = credentialsPath()
  if (key === null) {
    // 清除
    try {
      const text = readFileSync(path, 'utf8')
      writeFileSync(path, text.replace(/^\s*DEEPSEEK_API_KEY:.*\n?/m, ''), 'utf8')
    } catch {
      /* 文件不存在即已清除 */
    }
    return { hasKey: false, masked: null }
  }
  const trimmed = key.trim()
  if (!/^[\w-]{8,}$/.test(trimmed)) throw new Error('API Key 格式不正确')
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    text = ''
  }
  const line = `DEEPSEEK_API_KEY: ${trimmed}\n`
  if (/^\s*DEEPSEEK_API_KEY:.*$/m.test(text)) {
    text = text.replace(/^\s*DEEPSEEK_API_KEY:.*$/m, line.trimEnd())
  } else {
    text = `${text.trimEnd()}\n${line}`
  }
  writeFileSync(path, text, 'utf8')
  return { hasKey: true, masked: `${trimmed.slice(0, 5)}…${trimmed.slice(-4)}` }
}

/* ---------- 技能管理 ---------- */

function parseSkillDoc(text: string): { name?: string; description?: string } {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
  const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim()
  const descMatch = /^description:\s*>-?\n((?:\s{2,}.*\n?)+)|^description:\s*(.+)$/m.exec(fm)
  let description = ''
  if (descMatch) {
    description = (descMatch[1] ?? descMatch[2] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .join(' ')
      .trim()
  }
  return { name, description }
}

export async function listHarnessSkills(): Promise<HarnessSkill[]> {
  let dirs: string[]
  try {
    dirs = await readdir(skillsDir())
  } catch {
    return []
  }
  const skills: HarnessSkill[] = []
  for (const d of dirs) {
    try {
      const text = await readFile(join(skillsDir(), d, 'SKILL.md'), 'utf8')
      const doc = parseSkillDoc(text)
      skills.push({
        id: d,
        name: doc.name ?? d,
        description: (doc.description ?? '').slice(0, 120)
      })
    } catch {
      /* 无 SKILL.md 的目录跳过 */
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

export async function deleteHarnessSkill(id: string): Promise<void> {
  if (!/^[\w][\w.-]*$/.test(id)) throw new Error('非法的技能目录名')
  await rm(join(skillsDir(), id), { recursive: true, force: true })
}

export async function installHarnessSkillFromDir(src: string): Promise<string> {
  const name = basename(src)
  if (!/^[\w][\w.-]*$/.test(name)) throw new Error('目录名不适合作为技能名')
  await mkdir(skillsDir(), { recursive: true })
  await rm(join(skillsDir(), name), { recursive: true, force: true })
  await cp(src, join(skillsDir(), name), { recursive: true })
  return name
}

export function harnessSkillsDir(): string {
  return skillsDir()
}
