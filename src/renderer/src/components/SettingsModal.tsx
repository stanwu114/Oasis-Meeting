import { useEffect } from 'react'
import { useUiStore } from '../stores/uiStore'
import { TRANSCRIBE_LANGUAGES } from '../../../shared/ipc'

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

  useEffect(() => {
    if (open) void useUiStore.getState().initModel()
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
                ⬇ 下载模型
              </button>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <h3>关于</h3>
          <p className="settings-about">
            Notion Oasis v0.1.0 — 本地优先的笔记与录音转写。所有数据保存在本机
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
