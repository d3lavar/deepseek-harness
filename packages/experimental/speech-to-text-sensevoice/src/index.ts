/** Optional local SenseVoice provider; activation performs no downloads or model loading. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type {} from '@deepseek-ai/dsh-subprocess'
import { registerLocalSpeechProvider } from '@deepseek-ai/dsh-experimental-speech-to-text-local'
import { Config } from './config.ts'
import { SenseVoiceWorker } from './recognizer.ts'
import { languages } from './input.ts'

export { Config } from './config.ts'
export const name = 'experimental-speech-to-text-sensevoice'
export const inject = ['speechToText', 'subprocess']

/**
 * Register the local recognizer and inspect disk caches without downloading or loading models.
 * @param ctx - Host registry and subprocess owner.
 * @param config - validated runtime configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const worker = new SenseVoiceWorker(ctx, config)
  const estimatedBytes = config.precision === 'int8' ? 1_000_000_000 : 2_000_000_000
  registerLocalSpeechProvider(ctx, config, worker, {
    providerId: config.providerId, name: `SenseVoiceSmall (${config.precision.toUpperCase()})`,
    languages, estimatedBytes, maximumMinutes: 10,
  })
}
