# Notion Oasis

本地优先的类 Notion 笔记应用,核心特性:**录音完全在本地离线转写**(中/英/日/韩/粤)。除首次下载语音模型外不联网,所有数据(笔记、录音、模型)只存在你的电脑上。

## 功能

- **块编辑器**:基于 BlockNote,`/` 命令菜单、块拖拽、Markdown 快捷输入(标题、列表、待办、引用、代码、图片等)
- **录音转写**:麦克风录音(实时波形 + 计时)→ 停止后自动本地转写,文稿内嵌在录音块中,可一键转为正文段落;支持重新转写
- **导入音频转写**:mp3 / m4a / wav / webm / flac 等格式,同一本地管线
- **页面树**:多级嵌套、拖拽排序/移动、重命名、回收站(可恢复/彻底删除)
- **全文搜索**:⌘K,覆盖标题与正文(含录音转写文稿)
- **深浅色主题**、中文界面

## 转写引擎

[ SenseVoice Small ](https://github.com/FunAudioLLM/SenseVoice)(int8,约 230MB,经 [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 运行):

- 中文字错率约 8%(Whisper large-v3 约 20%),速度约 90 倍实时(M 系列芯片 CPU 即可)
- 首次转写前自动从 HuggingFace 下载模型,设置页可查看进度
- 长音频先经能量 VAD 按静音切分为段落,再逐段识别,天然形成文稿分段

## 开发

```bash
npm install        # 安装依赖(postinstall 会为 Electron 重编译 better-sqlite3)
npm run dev        # 启动开发模式
npm run typecheck  # 类型检查
npm run build      # 构建
npm run dist       # 打包 macOS dmg/zip(electron-builder)
```

辅助脚本:

```bash
npm run smoke:native   # 验证 better-sqlite3 / sherpa-onnx 在 Electron 下可加载
npx electron scripts/transcribe-e2e.cjs   # 端到端转写测试(下载模型→合成中文语音→识别)
```

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面框架 | Electron 43 + electron-vite 5 + React 19 + TypeScript |
| 编辑器 | BlockNote 0.54(自定义 `recording` 块) |
| 存储 | better-sqlite3(WAL)+ 音频文件存 userData/media |
| 转写 | sherpa-onnx-node(SenseVoice Small int8,CPU) |
| 录音/波形 | MediaRecorder(webm/opus)+ fix-webm-duration + wavesurfer.js 7 |
| 状态 | zustand |

音频管线无需 ffmpeg:渲染进程用 Chromium 解码器(`decodeAudioData` + `OfflineAudioContext`)把任意格式重采样为 16kHz 单声道 PCM,IPC 传入主进程识别。

## 数据位置

```
~/Library/Application Support/Notion Oasis/
├── oasis.db          # SQLite(页面、录音元数据)
├── media/            # 录音与导入的音频文件
└── models/sensevoice # 语音识别模型
```

## 常见问题

- **麦克风权限**:首次录音会请求系统权限;拒绝后需到 系统设置 → 隐私与安全性 → 麦克风 中手动允许。开发模式下进程名为 Electron。
- **模型下载慢/失败**:设置页可重试;或手动把 `model.int8.onnx` 与 `tokens.txt` 放入上述 models/sensevoice 目录(来源:[HuggingFace](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17))。
- **better-sqlite3 报 ABI 错误**:运行 `npx electron-rebuild -f -w better-sqlite3`(需 Xcode Command Line Tools)。

## 打包

```bash
npm run dist   # 产出 dist/ 下的 arm64 dmg 与 zip
```

已内置 `NSMicrophoneUsageDescription` 等权限声明;sherpa-onnx / better-sqlite3 的原生二进制通过 asarUnpack 外置。如需分发,建议补充签名与公证配置(electron-builder `identity` 等)。
