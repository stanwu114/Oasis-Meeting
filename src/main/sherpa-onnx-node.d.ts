/**
 * sherpa-onnx-node 的最小类型声明。
 * 若上游包自带类型则以上游为准;此声明保证构建不因缺类型而失败。
 */
declare module 'sherpa-onnx-node' {
  export interface OfflineStream {
    acceptWaveform(input: { sampleRate: number; samples: Float32Array }): void
  }

  export interface OfflineRecognizerResult {
    text?: string
    tokens?: string[]
    timestamps?: number[]
  }

  export class OfflineRecognizer {
    constructor(config: unknown)
    createStream(): OfflineStream
    decode(stream: OfflineStream): void
    getResult(stream: OfflineStream): OfflineRecognizerResult
  }

  const sherpaOnnx: {
    OfflineRecognizer: typeof OfflineRecognizer
  } & Record<string, unknown>

  export default sherpaOnnx
}
