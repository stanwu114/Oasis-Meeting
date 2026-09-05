import { useEffect, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { BrandMark } from './BrandMark'
import { TRANSCRIBE_LANGUAGES, type LlmConfigState } from '../../../shared/ipc'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function SettingsView() {
  const theme = useUiStore((s) => s.theme)
  const language = useUiStore((s) => s.language)
  const modelStatus = useUiStore((s) => s.modelStatus)
  const [llmState, setLlmState] = useState<LlmConfigState>({ hasKey: false, masked: null, baseUrl: '', model: '' })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [engineChecking, setEngineChecking] = useState(false)
  const [engineResult, setEngineResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    void useUiStore.getState().initModel()
    void window.oasis.llm.getConfig().then((c) => {
      setLlmState(c)
      setBaseUrlInput(c.baseUrl)
      setModelInput(c.model)
    })
  }, [])

  const total = modelStatus?.files.reduce((a, f) => a + (f.totalBytes ?? 0), 0) ?? 0
  const downloaded = modelStatus?.files.reduce((a, f) => a + f.downloadedBytes, 0) ?? 0
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0

  return (
    <div className="settings-view">
      <h1 className="settings-page-title">设置</h1>
      <p className="settings-page-sub">外观、转写引擎与 AI 的配置,后续设置项会逐步加到这里。</p>

      <section className="settings-section">
        <h3>外观</h3>
        <div className="settings-row">
          <span>主题</span>
          <div className="seg">
            <button
              type="button"
              className={theme === 'light' ? 'on' : ''}
              onClick={() => {
                if (theme !== 'light') useUiStore.getState().toggleTheme()
              }}
            >
              浅色
            </button>
            <button
              type="button"
              className={theme === 'dark' ? 'on' : ''}
              onClick={() => {
                if (theme !== 'dark') useUiStore.getState().toggleTheme()
              }}
            >
              深色
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>录音转写</h3>
        <div className="settings-row">
          <span>识别语言</span>
          <select
            value={language}
            onChange={(e) => useUiStore.getState().setLanguage(e.target.value)}
            className="settings-select"
          >
            {TRANSCRIBE_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <span>AI 纪要</span>
          <span className="settings-value muted">转写完成后自动生成,自动命名会议(模型在「AI 总结模型配置」中设置)</span>
        </div>

        <div className="settings-model">
          <div className="settings-row">
            <span>本地引擎</span>
            <span className="settings-value">SenseVoice Small · 中英日韩粤 · 完全离线</span>
          </div>
          <div className="settings-row">
            <span>模型文件</span>
            {modelStatus?.downloaded ? (
              <span className="settings-value ok">已就绪({formatBytes(downloaded)})</span>
            ) : modelStatus?.downloading ? (
              <span className="settings-value">
                下载中 {percent}%({formatBytes(downloaded)} / {formatBytes(total)})
              </span>
            ) : (
              <span className="settings-value muted">未下载(约 240MB,仅需一次)</span>
            )}
          </div>
          {modelStatus?.downloading ? (
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          {modelStatus?.error ? <div className="settings-error">{modelStatus.error}</div> : null}
          {!modelStatus?.downloaded && !modelStatus?.downloading ? (
            <button
              type="button"
              className="btn primary small"
              onClick={() => {
                void window.oasis.models.ensure()
              }}
            >
              下载模型
            </button>
          ) : null}
          {modelStatus?.downloaded ? (
            <div className="settings-row">
              <span>引擎检测</span>
              <button
                type="button"
                className="btn ghost small"
                disabled={engineChecking}
                onClick={() => {
                  setEngineChecking(true)
                  setEngineResult(null)
                  void window.oasis.engine.check().then((r) => {
                    setEngineResult(r)
                    setEngineChecking(false)
                  })
                }}
              >
                {engineChecking ? '检测中…' : '检测引擎'}
              </button>
              {engineResult ? (
                <span className={`settings-value ${engineResult.ok ? 'ok' : ''}`} style={{ marginLeft: 8 }}>
                  {engineResult.message}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <DataLocationSection />

      <section className="settings-section">
        <h3>AI 总结模型配置</h3>
        <div className="settings-model">
          <div className="settings-row">
            <span>API Key</span>
            <span className="settings-value">
              {llmState.hasKey ? `已配置(${llmState.masked})` : '未配置'}
            </span>
          </div>
          <div className="settings-row">
            <input
              className="settings-input"
              type="password"
              placeholder={llmState.hasKey ? '输入新 Key 覆盖' : 'sk-…'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button
              type="button"
              className="btn primary small"
              disabled={!apiKeyInput.trim()}
              onClick={() => {
                void window.oasis.llm.setConfig({ apiKey: apiKeyInput.trim() }).then((s) => {
                  setLlmState(s)
                  setApiKeyInput('')
                  useUiStore.getState().showToast('API Key 已保存')
                })
              }}
            >
              保存
            </button>
            {llmState.hasKey ? (
              <button
                type="button"
                className="btn danger-ghost small"
                onClick={() => {
                  void window.oasis.llm.setConfig({ apiKey: '' }).then((s) => {
                    setLlmState(s)
                    useUiStore.getState().showToast('已清除 API Key')
                  })
                }}
              >
                清除
              </button>
            ) : null}
          </div>
          <div className="settings-row">
            <span>接口地址</span>
            <input
              className="settings-input"
              type="text"
              placeholder="https://api.deepseek.com"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
            />
          </div>
          <div className="settings-row">
            <span>模型</span>
            <input
              className="settings-input"
              type="text"
              placeholder="deepseek-chat"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
            />
          </div>
          <div className="settings-row">
            <button
              type="button"
              className="btn ghost small"
              disabled={!baseUrlInput.trim() || !modelInput.trim()}
              onClick={() => {
                void window.oasis.llm.setConfig({ baseUrl: baseUrlInput.trim(), model: modelInput.trim() }).then((s) => {
                  setLlmState(s)
                  setTestResult(null)
                  useUiStore.getState().showToast('接口配置已保存')
                })
              }}
            >
              保存配置
            </button>
            <button
              type="button"
              className="btn primary small"
              disabled={testing}
              onClick={() => {
                setTesting(true)
                setTestResult(null)
                void window.oasis.llm.test().then((r) => {
                  setTestResult(r)
                  setTesting(false)
                })
              }}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
          </div>
          {testResult ? (
            <div className={testResult.ok ? 'settings-value ok' : 'settings-error'}>
              {testResult.ok ? '✅' : '❌'} {testResult.message}
            </div>
          ) : null}
        </div>
        <p className="settings-about" style={{ marginTop: 8 }}>
          AI 纪要、会议命名等能力由此接口驱动;兼容 OpenAI 风格 /chat/completions,
          配置保存在本机应用数据中,与外部工具互不干扰。
        </p>
      </section>

      <section className="settings-section">
        <h3>关于</h3>
        <div className="about-brand">
          <BrandMark variant="meeting" size={22} />
          <span className="about-brand-name">Oasis <em>Meeting</em></span>
          <span className="about-brand-ver">@Stan Ng</span>
        </div>
        <p className="settings-about">
          本地优先的会议记录与录音转写。所有数据保存在本机
          (数据库、音频与模型均在应用数据目录),除首次下载模型外不联网。
        </p>
      </section>
    </div>
  )
}

/** 数据存储位置管理区块 */
function DataLocationSection(): React.ReactNode {
  const [info, setInfo] = useState<{ current: string; isDefault: boolean; totalBytes: number } | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState('')

  async function load(): Promise<void> {
    try { setInfo(await window.oasis.data.getLocation()) } catch { /* 静默 */ }
  }

  useEffect(() => { void load() }, [])

  async function handleChange(): Promise<void> {
    const r = await window.oasis.data.chooseLocation()
    if (!r.path) return
    setMigrating(true)
    setMigrateMsg('正在迁移数据…(可能需要数分钟)')
    const result = await window.oasis.data.migrateLocation(r.path)
    setMigrating(false)
    setMigrateMsg(result.ok ? '迁移完成' : (result.message ?? '迁移失败'))
    await load()
  }

  if (!info) return null

  return (
    <section className="settings-section">
      <h3>数据与存储</h3>
      <div className="settings-row">
        <span>当前位置</span>
        <span className="settings-value" style={{ fontSize: 11, maxWidth: 300, wordBreak: 'break-all' }}>
          {info.current}
        </span>
      </div>
      <div className="settings-row">
        <span>数据大小</span>
        <span className="settings-value">{formatBytes(info.totalBytes)}</span>
      </div>
      <div className="settings-row">
        <span>存储模式</span>
        <span className="settings-value muted">{info.isDefault ? '默认位置' : '自定义位置'}</span>
      </div>
      <div className="settings-row">
        <span />
        <button type="button" className="btn ghost small" disabled={migrating} onClick={() => void handleChange()}>
          {migrating ? '迁移中…' : '更改数据位置…'}
        </button>
      </div>
      {migrateMsg ? (
        <div className="settings-row">
          <span />
          <span className="settings-value" style={{ fontSize: 11 }}>{migrateMsg}</span>
        </div>
      ) : null}
    </section>
  )
}
