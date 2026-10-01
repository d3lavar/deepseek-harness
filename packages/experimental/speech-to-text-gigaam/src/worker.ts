/** Private child entry; the Host owns termination, and stdout carries only readiness. */
import { runRecognitionWorker } from '@deepseek-ai/dsh-experimental-speech-to-text-local'
import { Config } from './config.ts'
import { createTranscriber } from './inference.ts'

await runRecognitionWorker(process.argv, Config, config => createTranscriber(config))
