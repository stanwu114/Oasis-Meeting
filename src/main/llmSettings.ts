import { getSetting, setSetting } from './db'

/**
 * AI 大模型接口配置:密钥/接口地址/模型,存应用自身 SQLite(settings 表),
 * 在设置面板单独管理。兼容 OpenAI 风格的 /chat/completions 接口(DeepSeek 等)。
 */

export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface LlmConfigState {
  hasKey: boolean
  masked: string | null
  baseUrl: string
  model: string
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

const KEY_API = 'llm.apiKey'
const KEY_URL = 'llm.baseUrl'
const KEY_MODEL = 'llm.model'

let cache: LlmConfig | null = null

export function getLlmConfig(): LlmConfig {
  if (cache) return cache
  cache = {
    apiKey: getSetting(KEY_API) ?? '',
    baseUrl: getSetting(KEY_URL) || DEFAULT_BASE_URL,
    model: getSetting(KEY_MODEL) || DEFAULT_MODEL
  }
  return cache
}

export function setLlmConfig(patch: { apiKey?: string; baseUrl?: string; model?: string }): LlmConfig {
  if (patch.apiKey !== undefined) setSetting(KEY_API, patch.apiKey.trim())
  if (patch.baseUrl !== undefined) setSetting(KEY_URL, patch.baseUrl.trim().replace(/\/+$/, ''))
  if (patch.model !== undefined) setSetting(KEY_MODEL, patch.model.trim())
  cache = null
  return getLlmConfig()
}

export function getLlmConfigState(): LlmConfigState {
  const c = getLlmConfig()
  return {
    hasKey: c.apiKey.length > 0,
    masked: c.apiKey ? `${c.apiKey.slice(0, 5)}…${c.apiKey.slice(-4)}` : null,
    baseUrl: c.baseUrl,
    model: c.model
  }
}

/** 用当前配置发一条最小请求,验证接口可用性 */
export async function testLlmConnection(): Promise<{ ok: boolean; message: string }> {
  const c = getLlmConfig()
  if (!c.apiKey) return { ok: false, message: '未配置 API Key' }
  try {
    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({ model: c.model, max_tokens: 8, messages: [{ role: 'user', content: '回复"ok"' }] }),
      signal: AbortSignal.timeout(20_000)
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, message: `HTTP ${res.status}:${body.slice(0, 120) || res.statusText}` }
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return { ok: false, message: '接口返回为空' }
    return { ok: true, message: `连接正常(${c.model})` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
