/** Verified runtime assets and managed downloads shared by host-local speech recognizers. */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { access, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { LocalProviderConfig } from './config.ts'
import type { SpeechPreparationState } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import { timeoutOf } from '@deepseek-ai/dsh-timeout'
import { classifyDownloadFailure, SpeechDownloadError } from './download-error.ts'
import { orderModelSources } from './model-sources.ts'

/** Release-pinned downloadable file. */
export interface Asset {
  readonly name: string
  readonly url: string
  readonly sha256: string
  readonly bytes: number
}

/** The three pinned assets one host-local recognizer runs on. */
export interface RuntimeLock {
  readonly model: Asset
  readonly tokens: Asset
  readonly vad: Asset
}

/** Prepared model and process paths, private to the local provider. */
export interface RuntimePaths {
  readonly model: string
  readonly tokens: string
  readonly vad: string
  readonly worker: string
}

/** The platform set the bundled sherpa-onnx Node package ships for. */
export function assertLocalSpeechPlatform(): void {
  const supported = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64']
  if (!supported.includes(`${process.platform}-${process.arch}`)) throw new Error(`Local speech is unavailable for ${process.platform}-${process.arch}`)
}

/**
 * Resolve the managed worker entry beside the calling provider module.
 * @param moduleUrl - the calling adapter module URL or its string form.
 * @param source - whether the provider runs from TypeScript source.
 * @returns the worker entry path the Host spawns.
 */
export function localWorkerPath(moduleUrl: string | URL, source: boolean): string {
  /* v8 ignore next -- built worker resolution is exercised by real Node and Electron process smokes */
  return fileURLToPath(new URL(source ? './worker.ts' : './worker.js', moduleUrl))
}

/**
 * Read one provider's pinned asset lock beside its adapter module.
 * @param moduleUrl - the adapter module URL or its string form.
 * @returns the parsed runtime lock.
 */
export function readLocalRuntimeLock<T>(moduleUrl: string | URL): T {
  return JSON.parse(readFileSync(new URL('../runtime/assets.json', moduleUrl), 'utf8')) as T
}

/**
 * Assemble model, tokens, VAD and worker paths for one host-local provider.
 * @param config - deployment paths selecting overrides.
 * @param modelRoot - the provider's cache directory for model and tokens.
 * @param model - managed model file name.
 * @param tokens - managed tokens file name.
 * @param vad - managed VAD file name.
 * @param worker - the provider's worker entry path.
 * @returns the resolved runtime paths.
 */
export function localRuntimePaths(config: LocalProviderConfig, modelRoot: string, model: string, tokens: string,
  vad: string, worker: string): RuntimePaths {
  return {
    model: join(modelRoot, model), tokens: join(modelRoot, tokens),
    vad: config.vadModelPath ?? join(config.dataRoot, 'models', 'silero', vad), worker,
  }
}

/** Preparation inputs resolved by the owning provider package. */
export interface RuntimePlan {
  readonly config: LocalProviderConfig
  readonly lock: RuntimeLock
  readonly modelRoot: string
  readonly paths: RuntimePaths
}

/**
 * Build the inspection and preparation entry points one provider adapter exports.
 * @param resolve - the adapter's own resolution from configuration to its runtime plan.
 * @returns the inspectRuntime and prepareRuntime functions the adapter re-exports.
 */
export function createLocalRuntimeAdapter<Config extends LocalProviderConfig>(resolve: (config: Config) => RuntimePlan): {
  inspectRuntime(config: Config, signal: AbortSignal): Promise<RuntimePaths | undefined>
  prepareRuntime(ctx: Context, config: Config, signal: AbortSignal, report?: (state: SpeechPreparationState) => void): Promise<RuntimePaths>
} {
  return {
    async inspectRuntime(config, signal) {
      const { lock, paths } = resolve(config)
      return await verifyPinnedRuntime(config, paths, lock, signal) ? paths : undefined
    },
    async prepareRuntime(_ctx, config, signal, report = () => {}) {
      const { lock, modelRoot, paths } = resolve(config)
      return await preparePinnedRuntime({ config, lock, modelRoot, paths }, signal, report)
    },
  }
}

/**
 * Check one file against its pinned size and SHA-256.
 * @param path - candidate cached file.
 * @param asset - pinned release identity.
 * @param signal - preparation cancellation.
 * @returns true when the file matches its pinned identity; missing files are absent, other errors surface.
 */
export async function matchesAsset(path: string, asset: Asset, signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new Error(`Speech asset is not a regular file: ${path}`)
    if (info.size !== asset.bytes) return false
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(path, { signal })) digest.update(chunk as Buffer)
    return digest.digest('hex') === asset.sha256
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
}

/**
 * Verify every managed path of one runtime plan without downloading.
 * @param config - deployment paths selecting which assets are managed here.
 * @param paths - resolved model, tokens, vad and worker paths.
 * @param lock - pinned identities for the managed assets.
 * @param signal - provider cancellation or inspection deadline.
 * @returns true when all managed files exist and match their pinned size and hash.
 */
export async function verifyPinnedRuntime(config: LocalProviderConfig, paths: RuntimePaths, lock: RuntimeLock,
  signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted()
  try { await Promise.all([paths.model, paths.tokens, paths.vad].map(path => access(path))) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
  const verified = [
    ...config.modelDirectory === undefined ? [[paths.model, lock.model], [paths.tokens, lock.tokens]] as const : [],
    ...config.vadModelPath === undefined ? [[paths.vad, lock.vad]] as const : [],
  ]
  for (const [path, asset] of verified) if (!await matchesAsset(path, asset, signal)) return false
  signal.throwIfAborted()
  return true
}

/**
 * Download into a unique partial file, verify, then publish it atomically.
 * @param asset - pinned release identity.
 * @param root - provider-owned cache directory.
 * @param signal - preparation cancellation.
 * @param report - Host-owned progress publisher.
 * @returns verified local file path; failures carry localized-UI diagnostics through SpeechDownloadError.
 */
export async function downloadAsset(asset: Asset, root: string, signal: AbortSignal,
  report: (state: SpeechPreparationState) => void = () => {}): Promise<string> {
  signal.throwIfAborted()
  const destination = join(root, asset.name)
  const partial = `${destination}.${randomUUID()}.part`
  let source = new URL(asset.url).origin
  try {
    await mkdir(root, { recursive: true })
    if (await matchesAsset(destination, asset, signal)) return destination
    try {
      const response = await fetch(asset.url, { signal })
      source = new URL(response.url || asset.url).origin
      if (!response.ok || !response.body) {
        await response.body?.cancel()
        throw new SpeechDownloadError({ resource: asset.name, source, reason: 'http', status: response.status })
      }
      const digest = createHash('sha256')
      let completedBytes = 0
      const publish = (): void => { report({ phase: 'downloading', resource: asset.name, completedBytes, totalBytes: asset.bytes }) }
      publish()
      const hashing = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        completedBytes += chunk.length
        if (completedBytes > asset.bytes) {
          callback(new SpeechDownloadError({ resource: asset.name, source, reason: 'integrity' })); return
        }
        digest.update(chunk); publish(); callback(null, chunk)
      } })
      await pipeline(response.body, hashing, createWriteStream(partial, { flags: 'wx', mode: 0o600 }), { signal })
      if (completedBytes !== asset.bytes || digest.digest('hex') !== asset.sha256) {
        throw new SpeechDownloadError({ resource: asset.name, source, reason: 'integrity' })
      }
      signal.throwIfAborted()
      await rename(partial, destination)
      return destination
    } finally {
      await rm(partial, { force: true })
    }
  } catch (error) {
    const timedOut = timeoutOf(signal)
    if (signal.aborted && !timedOut || error instanceof SpeechDownloadError) throw error
    throw new SpeechDownloadError({ resource: asset.name, source,
      ...timedOut ? { reason: 'timeout' } : classifyDownloadFailure(error),
    }, { cause: error })
  }
}

/**
 * Resolve the prepared runtime: download missing pinned assets through the source policy, then verify.
 * @param plan - config, normalized lock, model root and resolved paths from the owning provider.
 * @param signal - preparation cancellation or deadline.
 * @param report - Host-owned progress publisher.
 * @returns the verified paths; corrupted or missing managed files fail preparation.
 */
export async function preparePinnedRuntime(plan: RuntimePlan, signal: AbortSignal,
  report: (state: SpeechPreparationState) => void = () => {}): Promise<RuntimePaths> {
  const { config, lock, modelRoot, paths } = plan
  const download = async (asset: Asset, root: string, step: 'model' | 'vad'): Promise<void> => {
    if (await matchesAsset(join(root, asset.name), asset, signal)) return
    const origins = config.modelOrigin === undefined ? config.modelOrigins : [config.modelOrigin]
    const urls = await orderModelSources(asset.url, origins, config.modelProbeTimeoutMs, signal)
    for (const [index, url] of urls.entries()) {
      try {
        await downloadAsset({ ...asset, url }, root, signal, (state) => { report({ ...state, step }) })
        return
      } catch (error) {
        if (signal.aborted || !(error instanceof SpeechDownloadError) || error.download.reason === 'storage'
          || error.download.reason === 'unknown' || index === urls.length - 1) throw error
      }
    }
  }
  if (config.modelDirectory === undefined) {
    report({ phase: 'checking', step: 'model', startedAt: Date.now() })
    await download(lock.model, modelRoot, 'model')
    await download(lock.tokens, modelRoot, 'model')
  }
  if (config.vadModelPath === undefined) {
    report({ phase: 'checking', step: 'vad', startedAt: Date.now() })
    await download(lock.vad, join(config.dataRoot, 'models', 'silero'), 'vad')
  }
  report({ phase: 'checking', step: 'verify', startedAt: Date.now() })
  if (!await verifyPinnedRuntime(config, paths, lock, signal)) throw new Error('Speech model verification failed: missing or corrupted model files')
  return paths
}
