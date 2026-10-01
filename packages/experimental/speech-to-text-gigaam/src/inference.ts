/** CPU GigaAM inference and Silero segmentation, confined to the recognition process. */
/* The two adapters instantiate one shared engine; their parallel headers are deliberate. */
/* jscpd:ignore-start */
import { createRequire } from 'node:module'
import type { Transcript } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import { localVadDetector, runVadTranscription, type SherpaBindings } from '@deepseek-ai/dsh-experimental-speech-to-text-local'
import type { LocalInferenceConfig } from '@deepseek-ai/dsh-experimental-speech-to-text-local'
import { validateInput } from './input.ts'

/** The sherpa-onnx Node-API binding shape this provider loads. */
type Sherpa = SherpaBindings
/* jscpd:ignore-end */



/**
 * Load one native model pair; every recording resets VAD for its full transcript.
 * @param config - verified ONNX paths and explicit CPU/VAD limits.
 * @returns synchronous inference confined to its dedicated process.
 */
export function createTranscriber(config: LocalInferenceConfig): (audio: Uint8Array, language: string) => Transcript {
  // sherpa-onnx-node publishes a CommonJS Node-API binding with JSDoc but no declarations.
  const sherpa = createRequire(import.meta.url)('sherpa-onnx-node') as Sherpa
  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { nemoCtc: { model: config.model }, tokens: config.tokens, numThreads: config.threads, provider: 'cpu', debug: 0 },
  })
  const detector = localVadDetector(sherpa, config)
  return (audio, language) =>
    runVadTranscription(recognizer, detector, audio, (wave, hint) => validateInput(wave, hint, config.maxAudioBytes), language)
}
