import { useEffect, useState } from 'react'
import { useUiStore } from '../stores/uiStore'
import { useHarnessStore } from '../stores/harnessStore'
import { TRANSCRIBE_LANGUAGES, type HarnessSettings, type HarnessSkill } from '../../../shared/ipc'

const HARNESS_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat']
const HARNESS_EFFORTS: { value: string; label: string }[] = [
  { value: 'high', label: '高(最强推理)' },
  { value: 'medium', label: '中(均衡)' },
  { value: 'low', label: '低(最快)' }
]

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const theme = useUiStore((s) => s.theme)
  const language = useUiStore((s) => s.language)
  const modelStatus = useUiStore((s) => s.modelStatus)
  const harnessState = useHarnessStore((s) => s.state)
  const [harnessSettings, setHarnessSettings] = useState<HarnessSettings | null>(null)
  const [apiKeyState, setApiKeyState] = useState<{ hasKey: boolean; masked: string | null }>({ hasKey: false, masked: null })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [skills, setSkills] = useState<HarnessSkill[]>([])

  useEffect(() => {
    if (open) {
      void useUiStore.getState().initModel()
      void window.oasis.harness.getSettings().then(setHarnessSettings)
      void window.oasis.harness.getApiKey().then(setApiKeyState)
      void window.oasis.harness.listSkills().then(setSkills)
      void useHarnessStore.getState().init()
    }
  }, [open])

  if (!open) return null
  const close = (): void => useUiStore.getState().setSettingsOpen(false)

  const total = modelStatus?.files.reduce((a, f) => a + (f.totalBytes ?? 0), 0) ?? 0
  const downloaded = modelStatus?.files.reduce((a, f) => a + f.downloadedBytes, 0) ?? 0
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-card settings-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">设置</h2>

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
            <span>AI 总结</span>
            <span className="settings-value muted">
              转写完成后自动调用 DeepSeek 生成纪要(密钥取自 ~/.dsh/.credentials.yaml)
            </span>
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
          </div>
        </section>

        <section className="settings-section">
          <h3>Harness(智能体)</h3>
          <div className="settings-model">
            <div className="settings-row">
              <span>运行状态</span>
              <span className="settings-value">
                {harnessState.status === 'ready'
                  ? '✅ 运行中'
                  : harnessState.status === 'starting'
                    ? '启动中…'
                    : harnessState.status === 'error'
                      ? '❌ 启动失败'
                      : harnessState.status === 'unavailable'
                        ? '未找到 dsh 检出'
                        : '未运行'}
              </span>
            </div>
            <div className="settings-row">
              <span>服务</span>
              <span className="settings-value">
                {harnessState.status === 'ready' || harnessState.status === 'starting' ? (
                  <button type="button" className="btn ghost small" onClick={() => void useHarnessStore.getState().stop()}>
                    停止
                  </button>
                ) : (
                  <button type="button" className="btn primary small" onClick={() => void useHarnessStore.getState().start()}>
                    启动
                  </button>
                )}
              </span>
            </div>
            <div className="settings-row">
              <span>默认模型</span>
              <select
                className="settings-select"
                value={harnessSettings?.model ?? ''}
                onChange={(e) => {
                  void window.oasis.harness.setSettings({ model: e.target.value }).then(setHarnessSettings)
                }}
              >
                {(harnessSettings && !HARNESS_MODELS.includes(harnessSettings.model)
                  ? [harnessSettings.model, ...HARNESS_MODELS]
                  : HARNESS_MODELS
                ).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-row">
              <span>推理强度</span>
              <select
                className="settings-select"
                value={harnessSettings?.reasoningEffort ?? 'high'}
                onChange={(e) => {
                  void window.oasis.harness.setSettings({ reasoningEffort: e.target.value }).then(setHarnessSettings)
                }}
              >
                {HARNESS_EFFORTS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            {harnessState.status === 'error' && harnessState.error ? (
              <div className="settings-error">{harnessState.error}</div>
            ) : null}
            <div className="settings-row">
              <span>API Key</span>
              <span className="settings-value">
                {apiKeyState.hasKey ? `已配置(${apiKeyState.masked})` : '未配置'}
              </span>
            </div>
            <div className="settings-row">
              <input
                className="settings-input"
                type="password"
                placeholder={apiKeyState.hasKey ? '输入新 Key 覆盖' : 'sk-…'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <button
                type="button"
                className="btn primary small"
                disabled={!apiKeyInput.trim()}
                onClick={() => {
                  void window.oasis.harness.setApiKey(apiKeyInput.trim()).then((s) => {
                    setApiKeyState(s)
                    setApiKeyInput('')
                    useUiStore.getState().showToast('API Key 已保存')
                  })
                }}
              >
                保存
              </button>
              {apiKeyState.hasKey ? (
                <button
                  type="button"
                  className="btn danger-ghost small"
                  onClick={() => {
                    void window.oasis.harness.setApiKey(null).then((s) => {
                      setApiKeyState(s)
                      useUiStore.getState().showToast('已清除 API Key')
                    })
                  }}
                >
                  清除
                </button>
              ) : null}
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>技能管理</h3>
          <div className="settings-model">
            <div className="settings-row">
              <span>已安装技能</span>
              <span className="settings-value muted">{skills.length} 个 · ~/.dsh/skills</span>
            </div>
            {skills.map((sk) => (
              <div key={sk.id} className="skill-row">
                <span className="skill-body">
                  <span className="skill-name">{sk.name}</span>
                  {sk.description ? <span className="skill-desc">{sk.description}</span> : null}
                </span>
                <button
                  type="button"
                  className="btn danger-ghost small"
                  onClick={() => {
                    void window.oasis.harness.deleteSkill(sk.id).then(() => {
                      void window.oasis.harness.listSkills().then(setSkills)
                      useUiStore.getState().showToast(`已删除技能 ${sk.name}`)
                    })
                  }}
                >
                  删除
                </button>
              </div>
            ))}
            {skills.length === 0 ? <div className="settings-value muted">暂无技能</div> : null}
            <div className="settings-row" style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  void window.oasis.harness.installSkillFromDir().then((r) => {
                    if (r) {
                      void window.oasis.harness.listSkills().then(setSkills)
                      useUiStore.getState().showToast(`已安装技能 ${r.name}`)
                    }
                  })
                }}
              >
                从文件夹安装
              </button>
              <button type="button" className="btn ghost small" onClick={() => void window.oasis.harness.revealSkillsDir()}>
                打开技能目录
              </button>
            </div>
          </div>
          <p className="settings-about" style={{ marginTop: 8 }}>
            Harness 配置写入 ~/.dsh(settings.yaml / .credentials.yaml / skills/),与 dsh 各界面共用。
          </p>
        </section>

        <section className="settings-section">
          <h3>关于</h3>
          <p className="settings-about">
            Oasis Meeting v0.1.0 — 本地优先的会议记录与录音转写。所有数据保存在本机
            (数据库、音频与模型均在应用数据目录),除首次下载模型外不联网。
          </p>
        </section>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={close}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
