/** CPU VAD segmentation and bounded decoding shared by host-local recognizers. */
import type { Transcript } from '@deepseek-ai/dsh-experimental-speech-to-text/types'

interface Stream { acceptWaveform(audio: { samples: Float32Array; sampleRate: number }): void }

/** The subset of the sherpa-onnx offline recognizer one decoding pass needs. */
export interface VadRecognizer {
  createStream(): Stream
  setConfig(config: object): void
  decode(stream: Stream): void
  getResult(stream: Stream): { text: string }
}

/** The subset of the sherpa-onnx Silero detector one decoding pass needs. */
export interface VadDetector {
  acceptWaveform(samples: Float32Array): void
  isEmpty(): boolean
  front(externalBuffer: false): { samples: Float32Array }
  pop(): void
  reset(): void
  flush(): void
}

/**
 * Build the Silero VAD detector one managed recognizer decodes with.
 * @param sherpa - the loaded Node-API binding.
 * @param config - VAD thresholds, segmentation bounds, and thread count.
 * @returns the native detector.
 */
/** VAD thresholds, segmentation bounds, and thread count one detector loads with. */
export interface VadDetectorConfig {
  readonly vad: string
  readonly vadThreshold: number
  readonly minSpeechSeconds: number
  readonly minSilenceSeconds: number
  readonly segmentSeconds: number
  readonly threads: number
}

export function localVadDetector(sherpa: SherpaBindings, config: VadDetectorConfig): VadDetector {
  return new sherpa.Vad({
    sileroVad: { model: config.vad, threshold: config.vadThreshold, minSilenceDuration: config.minSilenceSeconds,
      minSpeechDuration: config.minSpeechSeconds, maxSpeechDuration: config.segmentSeconds, windowSize: 512 },
    sampleRate: 16000, numThreads: config.threads, provider: 'cpu', debug: 0,
  }, config.segmentSeconds + config.minSilenceSeconds + 1)
}

/** The sherpa-onnx Node-API binding surface host-local recognizers load. */
export interface SherpaBindings {
  OfflineRecognizer: new (config: object) => VadRecognizer
  Vad: new (config: object, bufferSeconds: number) => VadDetector
}

/**
 * Decode one complete WAV recording through Silero segmentation and native decoding.
 * @param recognizer - loaded native recognizer.
 * @param detector - loaded native VAD detector.
 * @param audio - validated WAV bytes with a 44-byte canonical header.
 * @param validate - the provider's input validation returning audio seconds.
 * @param language - request language hint carried to validation.
 * @returns the joined transcript with measured audio and inference seconds.
 */
export function runVadTranscription(recognizer: VadRecognizer, detector: VadDetector, audio: Uint8Array,
  validate: (audio: Uint8Array, language: string) => number, language: string): Transcript {
  const audioSeconds = validate(audio, language)
  const pcm = new DataView(audio.buffer, audio.byteOffset + 44, audio.byteLength - 44)
  const samples = Float32Array.from({ length: pcm.byteLength / 2 }, (_, i) => pcm.getInt16(i * 2, true) / 32768)
  detector.reset()
  const started = performance.now(), texts: string[] = []
  const drain = (): void => {
    while (!detector.isEmpty()) {
      // Electron's V8 memory cage requires copied native buffers, including VAD output.
      const segment = detector.front(false)
      const stream = recognizer.createStream()
      stream.acceptWaveform({ sampleRate: 16000, samples: segment.samples })
      recognizer.decode(stream)
      texts.push(recognizer.getResult(stream).text.trim())
      detector.pop()
    }
  }
  for (let offset = 0; offset < samples.length; offset += 512) {
    detector.acceptWaveform(samples.subarray(offset, offset + 512))
    drain()
  }
  detector.flush(); drain()
  return { text: texts.filter(Boolean).join(' ').trim(), audioSeconds, inferenceSeconds: (performance.now() - started) / 1000 }
}
