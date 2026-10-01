/** Provider activation remains lazy and rejects relative deployment paths. */
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import { afterEach, expect, it, vi } from 'vitest'
import * as Provider from '../src/index.ts'
import { GigaamWorker } from '../src/recognizer.ts'

afterEach(() => { vi.restoreAllMocks() })

it('registers lazily and joins inference before withdrawal completes', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(LocalSubprocess)
    await ctx.plugin(SpeechToText, { defaultProvider: 'gigaam-local', language: 'ru' })
    const transcribe = vi.spyOn(GigaamWorker.prototype, 'transcribe')
    const fiber = ctx.plugin(Provider, { dataRoot: process.cwd() })
    await fiber
    expect(transcribe).not.toHaveBeenCalled()
    const speech = ctx.get('speechToText')!
    expect(speech.listProviders()).toMatchObject([{ id: 'gigaam-local', location: 'host-local', languages: ['ru'] }])
    expect(speech.listProviders()[0]?.setupEstimate).toEqual({
      recommendedDiskBytes: 5e8, expectedMemoryBytes: 5e8,
      minimumMinutes: 1, maximumMinutes: 5,
    })
    await expect(speech.transcribe(speech.resolve({ audio: new Uint8Array() }), new AbortController().signal)).rejects.toThrow('Prepare')
    transcribe.mockResolvedValue({ text: 'hello', audioSeconds: 1, inferenceSeconds: 0.1 })
    expect((await speech.transcribe(speech.resolve({ audio: new Uint8Array() }), new AbortController().signal)).text).toBe('hello')
    await fiber.dispose()
    expect(speech.listProviders()).toEqual([])
  } finally { await ctx.fiber.dispose() }
})

it('refuses relative runtime, model and cache paths before registration', () => {
  for (const field of ['dataRoot', 'modelDirectory', 'vadModelPath']) {
    expect(() => { Provider.apply(new Context(), Provider.Config({ dataRoot: process.cwd(), [field]: 'relative' })) })
      .toThrow('absolute')
  }
  expect(() => Provider.Config({ dataRoot: process.cwd(), threads: 0 })).toThrow()
})

it.each([
  { modelOrigins: [] }, { modelOrigins: ['https://example.com/path'] }, { modelOrigins: ['https://user:secret@example.com'] },
  { modelOrigin: 'file:///models' }, { modelProbeTimeoutMs: 0 }, { modelProbeTimeoutMs: 2_147_483_648 },
])('rejects invalid download source configuration %j', (config) => {
  expect(() => Provider.Config({ dataRoot: process.cwd(), ...config })).toThrow()
})
