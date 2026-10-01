/** Private child entry shared by host-local speech recognizers; the Host owns termination. */
import type { LocalInferenceConfig } from './config.ts'

/** The verified file paths the worker configuration carries beside its deployment fields. */
type InferenceFiles = Pick<LocalInferenceConfig, 'model' | 'tokens' | 'vad'>
import type { Transcript } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import { z } from 'zod'
import { startRecognitionServer } from './process-server.ts'

/**
 * Validate the child invocation and serve transcriptions on an authenticated loopback port.
 * @param argv - the child process argv; position 2 carries the JSON configuration.
 * @param parse - the owning package's configuration validator.
 * @param create - builds the synchronous transcriber from parsed paths and configuration.
 * @returns when the process is ready to be terminated by the Host; stdout carries only the readiness frame.
 */
export async function runRecognitionWorker<T extends { maxAudioBytes: number }>(argv: string[],
  parse: (raw: Record<string, unknown>) => T,
  create: (config: T & InferenceFiles) => (audio: Uint8Array, language: string) => Transcript): Promise<void> {
  const raw: unknown = JSON.parse(z.string().parse(argv[2]))
  const paths = z.object({ model: z.string().min(1), tokens: z.string().min(1), vad: z.string().min(1) }).parse(raw)
  const config = Object.assign(parse(z.record(z.string(), z.unknown()).parse(raw)), paths)
  const token = z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.DSH_SPEECH_TOKEN)
  delete process.env.DSH_SPEECH_TOKEN
  const { server, port } = await startRecognitionServer(token, config.maxAudioBytes, create(config))
  process.stdout.write(`${JSON.stringify({ port })}\n`)
  void server
}
