import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Harness 设置:读写 ~/.dsh/settings.yaml 的 agent-default-model 块
 * (provider/model/reasoningEffort),其余内容原样保留。
 */

export interface HarnessSettings {
  provider: string
  model: string
  reasoningEffort: string
}

export const HARNESS_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat']
export const HARNESS_EFFORTS = ['high', 'medium', 'low']

function settingsPath(): string {
  return join(homedir(), '.dsh', 'settings.yaml')
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
