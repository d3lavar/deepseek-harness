/** One serial GigaAM worker with request-owned cancellation and idle reclamation. */
import type { Context } from '@deepseek-ai/cordis'
import type { RuntimeDependencies } from '@deepseek-ai/dsh-experimental-speech-to-text-local'
import { ManagedSpeechWorker } from '@deepseek-ai/dsh-experimental-speech-to-text-local'
import type { Config } from './config.ts'
import { inspectRuntime, prepareRuntime } from './runtime.ts'

export { readReady, readTranscript } from '@deepseek-ai/dsh-experimental-speech-to-text-local'

/** Own one worker across recordings, and join every accepted job on disposal. */
export class GigaamWorker extends ManagedSpeechWorker {
  constructor(ctx: Context, config: Config) {
    const runtime: RuntimeDependencies = {
      inspectRuntime,
      prepareRuntime: (preparedConfig, signal, report) => prepareRuntime(ctx, preparedConfig as Config, signal, report),
    }
    super(ctx, config, { label: 'GigaAM', runtime })
  }
}
