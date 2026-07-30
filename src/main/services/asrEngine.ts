/**
 * ASR engine lifecycle: forks the sherpa-onnx worker as a utilityProcess,
 * relays partials/state to the renderer, kills the child after idling.
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'
import { asrModelsDir } from './paths'
import { presetById, downloadPlan, presetTotalBytes } from '@shared/asr-models'
import { statSize } from './modelDownloader'
import type { AsrPartialEvent, AsrStateEvent } from '@shared/ipc'

const IDLE_KILL_MS = 10 * 60 * 1000
const CRASH_WINDOW_MS = 60 * 1000

type Emit = {
  partial: (p: AsrPartialEvent) => void
  state: (s: AsrStateEvent) => void
}

let child: UtilityProcess | null = null
let ready = false
let activePresetId: string | null = null
let idleTimer: NodeJS.Timeout | null = null
let stopping = false
let lastCrashAt = 0
let sessionActive = false

let emit: Emit = { partial: () => {}, state: () => {} }

export function setAsrEmitter(e: Emit): void {
  emit = e
}

export function asrCached(presetId: string): boolean {
  const preset = presetById(presetId)
  if (!preset) return false
  const dir = join(asrModelsDir(), preset.dir)
  return downloadPlan(preset, (name) => statSize(join(dir, name))).complete
}

export function asrStatus(presetId: string) {
  const preset = presetById(presetId)
  return {
    running: child !== null,
    ready,
    cached: asrCached(presetId),
    presetId,
    totalBytes: preset ? presetTotalBytes(preset) : 0
  }
}

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function spawn(presetId: string): void {
  stopping = false
  ready = false
  activePresetId = presetId
  emit.state({ state: 'starting' })

  const proc = utilityProcess.fork(join(__dirname, 'asrWorker.js'), [], {
    serviceName: 'latteprompter-asr-engine'
  })
  child = proc

  proc.on('message', (msg: any) => {
    if (proc !== child) return
    switch (msg?.type) {
      case 'ready':
        ready = true
        emit.state({ state: 'ready' })
        break
      case 'partial':
        emit.partial(msg as AsrPartialEvent)
        break
      case 'error':
        emit.state({ state: 'error', code: msg.code, message: msg.message })
        break
    }
  })

  proc.on('exit', () => {
    if (proc !== child) return
    child = null
    ready = false
    if (stopping) return
    // Unexpected death mid-session: respawn once, give up on rapid re-crash.
    const now = Date.now()
    const rapid = now - lastCrashAt < CRASH_WINDOW_MS
    lastCrashAt = now
    if (sessionActive && !rapid && activePresetId) {
      spawn(activePresetId)
    } else {
      emit.state({ state: 'error', code: 'engine-crashed', message: 'Speech engine stopped unexpectedly' })
    }
  })

  proc.postMessage({ type: 'init', modelsDir: asrModelsDir(), presetId })
}

export function startAsr(presetId: string): { cached: boolean } {
  const cached = asrCached(presetId)
  if (!cached) {
    emit.state({ state: 'error', code: 'model-missing', message: 'Speech model not downloaded yet' })
    return { cached }
  }
  sessionActive = true
  clearIdleTimer()
  if (child && activePresetId === presetId) {
    if (ready) emit.state({ state: 'ready' })
    return { cached }
  }
  if (child) {
    stopping = true
    child.kill()
    child = null
  }
  spawn(presetId)
  return { cached }
}

export function feedAsr(pcm: ArrayBuffer, sampleRate: number): void {
  if (!child || !ready) return
  child.postMessage({ type: 'feed', pcm, sampleRate })
}

/** Leaving the prompter: keep the warm engine around for a while, then kill it. */
export function stopAsr(): void {
  sessionActive = false
  if (child) child.postMessage({ type: 'flush' })
  clearIdleTimer()
  idleTimer = setTimeout(() => {
    killAsr()
  }, IDLE_KILL_MS)
  emit.state({ state: 'idle' })
}

export function killAsr(): void {
  clearIdleTimer()
  sessionActive = false
  if (child) {
    stopping = true
    child.kill()
    child = null
  }
  ready = false
}
