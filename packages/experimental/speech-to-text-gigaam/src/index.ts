/** Optional local GigaAM provider; activation performs no downloads or model loading. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type {} from '@deepseek-ai/dsh-subprocess'
import { registerLocalSpeechProvider } from '@deepseek-ai/dsh-experimental-speech-to-text-local'
import { Config } from './config.ts'
import { GigaamWorker } from './recognizer.ts'
import { languages } from './input.ts'

export { Config } from './config.ts'
export const name = 'experimental-speech-to-text-gigaam'
export const inject = ['speechToText', 'subprocess']

/**
 * Register the local recognizer and inspect disk caches without downloading or loading models.
 * @param ctx - Host registry and subprocess owner.
 * @param config - validated runtime configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const worker = new GigaamWorker(ctx, config)
  registerLocalSpeechProvider(ctx, config, worker, {
    providerId: config.providerId, name: 'GigaAM v2 (INT8)',
    languages, estimatedBytes: 500_000_000, maximumMinutes: 5,
  })
}
