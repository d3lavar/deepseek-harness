/** Provider registration shared by host-local speech recognizers. */
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { SpeechProviderId } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type { LocalProviderConfig } from './config.ts'
import type { ManagedSpeechWorker } from './managed-worker.ts'

/** Registration facts one host-local provider declares to the speech service. */
export interface LocalProviderRegistration {
  /** Unique registration id consumers select. */
  readonly providerId: string
  /** Display name carrying the model family and precision. */
  readonly name: string
  /** Language hints the recognizer accepts. */
  readonly languages: readonly string[]
  /** Disk and memory estimate advertised before preparation. */
  readonly estimatedBytes: number
  /** Upper preparation-time estimate in minutes. */
  readonly maximumMinutes: number
}

/**
 * Register one host-local recognizer and inspect disk caches without downloading or loading models.
 * @param ctx - Host registry and subprocess owner.
 * @param config - validated runtime configuration.
 * @param worker - the provider's managed worker.
 * @param registration - the provider's declared facts.
 */
export function registerLocalSpeechProvider(ctx: Context, config: LocalProviderConfig,
  worker: ManagedSpeechWorker, registration: LocalProviderRegistration): void {
  for (const path of [config.dataRoot, config.modelDirectory, config.vadModelPath]) {
    if (path !== undefined && !isAbsolute(path)) throw new Error(`${registration.name} paths must be absolute: ${path}`)
  }
  for (const origin of config.modelOrigin === undefined ? config.modelOrigins : [config.modelOrigin]) new URL(origin)
  ctx.effect(() => {
    const unregister = ctx.speechToText.register({
      info: { id: registration.providerId as SpeechProviderId, name: registration.name, location: 'host-local', languages: registration.languages, downloadSources: worker.downloadSources,
        setupEstimate: { recommendedDiskBytes: registration.estimatedBytes, expectedMemoryBytes: registration.estimatedBytes,
          minimumMinutes: 1, maximumMinutes: registration.maximumMinutes } },
      preparation: worker,
      transcribe: async (input, signal) => await worker.transcribe(input, signal),
    })
    worker.inspect()
    return async () => {
      const removing = unregister()
      await worker.dispose()
      await removing
    }
  })
}
