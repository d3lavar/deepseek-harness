/** Deployment configuration for the managed local SenseVoice recognizer. */
import z from '@deepseek-ai/schemastery'
import { localConfigFields, type LocalProviderConfig } from '@deepseek-ai/dsh-experimental-speech-to-text-local'

/** Local runtime, inference, and retention settings. */
export interface Config extends LocalProviderConfig {
  /** Unique registration id; consumers select this exact id. */
  providerId: string
  /** Weight precision; INT8 minimizes first-use download and model storage. */
  precision: 'int8' | 'fp32'
}

/** Validate deployment-varying runtime choices at plugin activation. */
export const Config: z<Partial<Config>, Config> = z.object({
  providerId: z.string().min(1).default('sensevoice-local'),
  ...localConfigFields,
  precision: z.union(['int8', 'fp32']).default('int8'),
})
