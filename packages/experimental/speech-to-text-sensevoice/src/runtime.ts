/** Verified SenseVoice runtime assets; downloads and verification live in the shared local runtime. */
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { Config } from './config.ts'
import { assertLocalSpeechPlatform, createLocalRuntimeAdapter, localRuntimePaths, localWorkerPath, readLocalRuntimeLock, type Asset } from '@deepseek-ai/dsh-experimental-speech-to-text-local'

export { downloadAsset, type Asset } from '@deepseek-ai/dsh-experimental-speech-to-text-local'

interface RuntimeLock {
  models: Record<Config['precision'], Asset>
  tokens: Asset
  vad: Asset
}

const adapter = createLocalRuntimeAdapter((config: Config) => {
  assertLocalSpeechPlatform()
  const lock = readLocalRuntimeLock<RuntimeLock>(import.meta.url)
  const modelRoot = config.modelDirectory ?? join(config.dataRoot, 'models', 'sensevoice-onnx')
  const paths = localRuntimePaths(config, modelRoot, lock.models[config.precision].name, lock.tokens.name, lock.vad.name,
    localWorkerPath(import.meta.url, import.meta.url.endsWith('.ts')))
  return { config, lock: { model: lock.models[config.precision], tokens: lock.tokens, vad: lock.vad }, modelRoot, paths }
})

export const { inspectRuntime, prepareRuntime } = adapter
