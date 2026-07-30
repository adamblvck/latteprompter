/**
 * LatePrompter — speech engine host.
 * Runs inside an Electron utilityProcess (plain Node context) so inference
 * never touches the UI thread.
 *
 * Two drive modes, chosen by the preset:
 *  - offline-stream (default, NeMo Parakeet): a pseudo-streamer. Incoming PCM
 *    accumulates in an utterance buffer; every TICK_MS the whole current
 *    utterance is re-decoded (Parakeet int8 runs at ~0.03 RTF, so a 10 s
 *    window costs ~220 ms) and emitted as a mutating partial. Trailing
 *    silence, or an over-long window, finalizes the utterance.
 *  - online (sherpa OnlineRecognizer): true streaming, kept for future presets.
 *
 * Protocol (parentPort messages):
 *   in : { type:'init', modelsDir, presetId }   // model files must already exist
 *   in : { type:'feed', pcm:ArrayBuffer(Float32), sampleRate }
 *   in : { type:'flush' }                        // force-finalize current utterance
 *   out: { type:'ready', presetId }
 *   out: { type:'partial', utteranceId, seq, text, isFinal }
 *   out: { type:'error', code?, message }
 */
import path from 'path'
import os from 'os'
import { presetById, downloadPlan, recognizerConfig, type AsrPreset } from '@shared/asr-models'
import { resampleLinear } from './services/audio'
import { statSize } from './services/modelDownloader'
import sherpa from 'sherpa-onnx-node'

const TARGET_RATE = 16000
const TICK_MS = 250
const MAX_UTTERANCE_SEC = 14
const ENDPOINT_SILENCE_MS = 900
const SILENCE_RMS = 0.012
const MIN_NEW_SAMPLES = 1600 // don't re-decode for <100 ms of new audio

const port = (process as unknown as { parentPort: Electron.ParentPort }).parentPort

let preset: AsrPreset | null = null
let recognizer: any = null // offline or online, per preset.kind
let onlineStream: any = null
let utteranceId = 0
let seq = 0
let lastText = ''

// offline-stream state
let buffer = new Float32Array(TARGET_RATE * 60)
let bufLen = 0
let utterStart = 0
let lastLoudSample = 0
let lastDecodedLen = 0
let busy = false
let ticker: ReturnType<typeof setInterval> | null = null

function send(msg: unknown): void {
  try {
    port?.postMessage(msg)
  } catch {
    /* parent gone */
  }
}

function handleInit(msg: { modelsDir: string; presetId: string }): void {
  try {
    preset = presetById(msg.presetId) ?? null
    if (!preset) {
      send({ type: 'error', code: 'model-missing', message: `Unknown preset ${msg.presetId}` })
      return
    }
    const modelDir = path.join(msg.modelsDir, preset.dir)
    const plan = downloadPlan(preset, (name) => statSize(path.join(modelDir, name)))
    if (!plan.complete) {
      send({ type: 'error', code: 'model-missing', message: 'Speech model not downloaded yet' })
      return
    }
    const threads = Math.min(4, Math.max(2, os.cpus().length - 2))
    const config = recognizerConfig(preset, modelDir, threads)

    if (preset.kind === 'online') {
      recognizer = new sherpa.OnlineRecognizer(config)
      onlineStream = recognizer.createStream()
      onlineStream.acceptWaveform({ samples: new Float32Array(9600), sampleRate: TARGET_RATE })
      while (recognizer.isReady(onlineStream)) recognizer.decode(onlineStream)
      recognizer.reset(onlineStream)
    } else {
      recognizer = new sherpa.OfflineRecognizer(config)
      // Warm-up so the first live decode isn't late.
      const s = recognizer.createStream()
      s.acceptWaveform({ samples: new Float32Array(9600), sampleRate: TARGET_RATE })
      void recognizer.decodeAsync(s).then(() => {
        startTicker()
        send({ type: 'ready', presetId: preset!.id })
      })
      return
    }
    send({ type: 'ready', presetId: preset.id })
  } catch (err) {
    send({ type: 'error', message: `Speech model load failed: ${(err as Error)?.message ?? err}` })
  }
}

/* ----------------------------- offline-stream ----------------------------- */

function appendPcm(pcm: Float32Array): void {
  if (bufLen + pcm.length > buffer.length) {
    // Buffer full — drop the oldest audio before the current utterance, or
    // force-finalize if the utterance itself is the problem.
    if (utterStart > TARGET_RATE) {
      buffer.copyWithin(0, utterStart, bufLen)
      bufLen -= utterStart
      lastLoudSample = Math.max(0, lastLoudSample - utterStart)
      lastDecodedLen = Math.max(0, lastDecodedLen - utterStart)
      utterStart = 0
    } else {
      finalizeUtterance(lastText)
      buffer.copyWithin(0, utterStart, bufLen)
      bufLen -= utterStart
      utterStart = 0
      lastLoudSample = 0
    }
    if (bufLen + pcm.length > buffer.length) {
      const grown = new Float32Array(Math.max(buffer.length * 2, bufLen + pcm.length))
      grown.set(buffer.subarray(0, bufLen))
      buffer = grown
    }
  }
  buffer.set(pcm, bufLen)
  // simple energy tracking for endpointing
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
  if (Math.sqrt(sum / pcm.length) >= SILENCE_RMS) lastLoudSample = bufLen + pcm.length
  bufLen += pcm.length
}

function finalizeUtterance(text: string, cutAt: number = bufLen): void {
  if (text) {
    send({ type: 'partial', utteranceId, seq: seq++, text, isFinal: true })
    utteranceId++
  }
  utterStart = cutAt
  lastDecodedLen = cutAt
  lastText = ''
}

function tick(): void {
  if (busy || !recognizer || preset?.kind !== 'offline-stream') return

  // Nothing spoken yet in this utterance — slide the window forward so we
  // never burn CPU decoding pure silence.
  if (lastLoudSample <= utterStart) {
    utterStart = Math.max(utterStart, bufLen - TARGET_RATE / 2)
    lastDecodedLen = bufLen
    return
  }
  if (bufLen - lastDecodedLen < MIN_NEW_SAMPLES) return

  const start = utterStart
  const end = bufLen
  busy = true
  const stream = recognizer.createStream()
  stream.acceptWaveform({ samples: buffer.slice(start, end), sampleRate: TARGET_RATE })
  recognizer
    .decodeAsync(stream)
    .then((result: { text?: string }) => {
      lastDecodedLen = end
      const text = (result?.text ?? '').trim()
      if (text && text !== lastText) {
        send({ type: 'partial', utteranceId, seq: seq++, text, isFinal: false })
        lastText = text
      }
      const silenceMs = ((bufLen - lastLoudSample) / TARGET_RATE) * 1000
      const utterSec = (bufLen - utterStart) / TARGET_RATE
      if (text && silenceMs >= ENDPOINT_SILENCE_MS) {
        finalizeUtterance(text)
      } else if (utterSec > MAX_UTTERANCE_SEC) {
        // Long continuous reading: cut at the decoded end so the undecoded
        // tail flows into the next utterance and decode latency stays flat.
        finalizeUtterance(text, end)
      }
    })
    .catch((err: Error) => {
      send({ type: 'error', message: `Decode failed: ${err?.message ?? err}` })
    })
    .finally(() => {
      busy = false
    })
}

function startTicker(): void {
  if (!ticker) ticker = setInterval(tick, TICK_MS)
}

/* --------------------------------- online --------------------------------- */

function handleFeedOnline(pcm: Float32Array): void {
  onlineStream.acceptWaveform({ samples: pcm, sampleRate: TARGET_RATE })
  while (recognizer.isReady(onlineStream)) recognizer.decode(onlineStream)
  const result = recognizer.getResult(onlineStream)
  const text: string = (result && result.text) || ''
  const atEndpoint: boolean = recognizer.isEndpoint(onlineStream)
  if (text && text !== lastText) {
    send({ type: 'partial', utteranceId, seq: seq++, text, isFinal: false })
    lastText = text
  }
  if (atEndpoint) {
    if (text) {
      send({ type: 'partial', utteranceId, seq: seq++, text, isFinal: true })
      utteranceId++
    }
    recognizer.reset(onlineStream)
    lastText = ''
  }
}

/* --------------------------------- wiring --------------------------------- */

function handleFeed(msg: { pcm: ArrayBuffer; sampleRate: number }): void {
  if (!recognizer || !preset) return
  try {
    let pcm: Float32Array = new Float32Array(msg.pcm)
    const rate = msg.sampleRate || TARGET_RATE
    if (rate !== TARGET_RATE) pcm = resampleLinear(pcm, rate, TARGET_RATE)
    if (preset.kind === 'online') handleFeedOnline(pcm)
    else appendPcm(pcm)
  } catch (err) {
    send({ type: 'error', message: `Feed failed: ${(err as Error)?.message ?? err}` })
  }
}

function handleFlush(): void {
  if (!recognizer || !preset) return
  if (preset.kind === 'online') {
    const result = recognizer.getResult(onlineStream)
    const text: string = (result && result.text) || ''
    if (text) {
      send({ type: 'partial', utteranceId, seq: seq++, text, isFinal: true })
      utteranceId++
    }
    recognizer.reset(onlineStream)
    lastText = ''
  } else {
    finalizeUtterance(lastText)
  }
}

port?.on('message', (e: { data?: { type?: string } }) => {
  const msg = (e.data ?? {}) as any
  switch (msg.type) {
    case 'init':
      handleInit(msg)
      break
    case 'feed':
      handleFeed(msg)
      break
    case 'flush':
      handleFlush()
      break
  }
})
