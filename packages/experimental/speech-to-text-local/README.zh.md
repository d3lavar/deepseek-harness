---
description: "托管本地语音识别器共享的工作进程管线。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-local

[English](README.md) | 中文

## 概述

此包承载托管式本地语音识别器所需的运行时管线：固定资源的下载与校验、单个带界队列的托管工作进程、带认证的环回子进程协议，以及 Silero VAD 解码。[SenseVoice](../speech-to-text-sensevoice/README.zh.md) 和 [GigaAM](../speech-to-text-gigaam/README.zh.md) 等 Provider 包提供各自的固定 `assets.json`、模型构建与支持语言，并重新导出其测试与消费者已经使用的共享入口。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

Provider 包把 `localConfigFields` 组合进自己的配置模式，在 `runtime/assets.json` 中声明固定文件，并把各自的解析逻辑传给 `createLocalRuntimeAdapter`。适配器解析平台支持、模型、词表、VAD 路径与 Provider 的工作进程入口；`preparePinnedRuntime` 通过配置的兼容 Hugging Face 源下载缺失的固定资源，并在使用前校验每个托管文件。`ManagedSpeechWorker` 拥有准备状态、准入、取消与空闲回收；`registerLocalSpeechProvider` 把识别器发布到 `ctx.speechToText`。

子进程侧与 Host 对应：`runRecognitionWorker` 校验子进程调用，`startRecognitionServer` 在带认证的临时环回端口上提供转写，直到 Host 终止它。`runVadTranscription` 通过 Silero VAD 分段一段完整 WAV，并拼接解码结果。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

工作进程类把运行时解析作为构造依赖注入，因此 Provider 包保留其测试可模拟的模块级注入点。下载先写入部分文件，对照固定身份校验大小与 SHA-256，然后原子发布；完整性、网络、HTTP、证书、超时和存储错误会分类为结构化诊断，不包含 URL 凭据、查询参数和原始底层原因。队列准入限制已接收任务，取消会等待进程范围退出，空闲回收停止工作进程但保留已校验缓存。音频仅在带认证的环回请求内存中保存。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[语音输入子系统](../../../docs/subsystems/voice-input.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为共享管线不进入模型请求；识别行为由各 Provider 包拥有。

#### KV 缓存影响

没有直接影响；普通提交拥有消息内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Silero VAD 解码路径假定 44 字节规范 WAV 头，与语音 UI 采集的录音一致。Provider 包各自拥有模型构建，因此识别质量、精度选项与语言支持因 Provider 而异，并在各自文档中说明。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
