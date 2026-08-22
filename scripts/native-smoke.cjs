// 验证两个原生模块能否在当前 Electron ABI 下加载
const { app } = require('electron')

app.whenReady().then(() => {
  const results = {}
  try {
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (x)')
    db.close()
    results['better-sqlite3'] = 'ok'
  } catch (e) {
    results['better-sqlite3'] = e.message
  }
  try {
    const sherpa = require('sherpa-onnx-node')
    results['sherpa-onnx-node'] =
      typeof sherpa.OfflineRecognizer === 'function' ? 'ok' : `no OfflineRecognizer (keys: ${Object.keys(sherpa).slice(0, 12).join(',')})`
  } catch (e) {
    results['sherpa-onnx-node'] = e.message
  }
  console.log('[native-smoke]', JSON.stringify(results, null, 2))
  const ok = Object.values(results).every((v) => v === 'ok')
  app.exit(ok ? 0 : 1)
})
