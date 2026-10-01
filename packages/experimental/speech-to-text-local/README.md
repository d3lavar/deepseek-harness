---
description: "Managed worker plumbing shared by host-local speech recognizers."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-local

English | [中文](README.zh.md)

## Summary

This package owns the runtime plumbing one managed host-local speech recognizer needs: pinned-asset download and verification, one serial managed worker with a bounded queue, the authenticated loopback child protocol, and Silero VAD decoding. Provider packages such as [SenseVoice](../speech-to-text-sensevoice/README.md) and [GigaAM](../speech-to-text-gigaam/README.md) supply their pinned `assets.json`, their model construction, and their accepted languages, and re-export the shared entry points their tests and consumers already import.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

A provider package composes `localConfigFields` into its configuration schema, declares its pinned files in `runtime/assets.json`, and passes its own resolution to `createLocalRuntimeAdapter`. The adapter resolves platform support, model, tokens and VAD paths, and the provider's worker entry; `preparePinnedRuntime` downloads missing pinned assets through the configured Hugging Face-compatible origins and verifies every managed file before use. `ManagedSpeechWorker` owns preparation state, admission, cancellation and idle reclamation; `registerLocalSpeechProvider` publishes the recognizer to `ctx.speechToText`.

The child side mirrors the Host: `runRecognitionWorker` validates the child invocation, and `startRecognitionServer` serves transcriptions on an authenticated ephemeral loopback port until the Host terminates it. `runVadTranscription` segments one complete WAV through Silero VAD and joins the decoded segments.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The worker class takes its runtime resolution as constructor dependencies, so provider packages keep module-level injection points their tests mock. Downloads write partial files, verify size and SHA-256 against the pinned identity, and publish atomically; integrity, network, HTTP, certificate, timeout and storage failures classify into structured diagnostics that omit URLs' credentials, query strings and raw causes. Queue admission bounds accepted work, cancellation joins process ranges, and idle reclamation stops the worker while retaining verified caches. Audio stays in memory on authenticated loopback requests.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Voice input subsystem](../../../docs/subsystems/voice-input.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as the shared plumbing stays outside model requests; provider packages own recognition behavior.

#### KV Cache effect

No direct effect; ordinary submission owns the message content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The Silero VAD decode path assumes a 44-byte canonical WAV header, matching the recordings the voice UI captures. Provider packages own their model construction, so recognition quality, precision choices and language support vary per provider and are documented there.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
