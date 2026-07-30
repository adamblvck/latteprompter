import type { StoreFile, WindowBounds } from './types'

/**
 * Single source of truth for IPC: channel names (`namespace:verb`) plus the
 * typed facade exposed on `window.lp`. Payloads are always a single
 * named-field object; main→renderer events are subscribe-functions that
 * return an unsubscribe closure.
 */
export const IPC = {
  store: {
    load: 'store:load',
    save: 'store:save',
    reveal: 'store:reveal'
  },
  dialog: {
    confirm: 'dialog:confirm'
  },
  shell: {
    openExternal: 'shell:openExternal'
  },
  window: {
    setFullScreen: 'window:setFullScreen',
    isFullScreen: 'window:isFullScreen',
    boundsChanged: 'window:onBoundsChanged'
  },
  media: {
    requestMicAccess: 'media:requestMicAccess'
  },
  asr: {
    start: 'asr:start',
    stop: 'asr:stop',
    status: 'asr:status',
    feed: 'asr:feed',
    downloadModel: 'asr:downloadModel',
    cancelDownload: 'asr:cancelDownload',
    deleteModel: 'asr:deleteModel',
    // events
    partial: 'asr:onPartial',
    state: 'asr:onState',
    modelProgress: 'asr:onModelProgress'
  }
} as const

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

export interface AsrPartialEvent {
  utteranceId: number
  seq: number
  text: string
  isFinal: boolean
}

export type AsrEngineState =
  | 'idle'
  | 'starting'
  | 'downloading'
  | 'ready'
  | 'running'
  | 'error'

export interface AsrStateEvent {
  state: AsrEngineState
  code?: 'engine-crashed' | 'download-failed' | 'model-missing'
  message?: string
}

export interface AsrModelProgressEvent {
  presetId: string
  file: string
  loaded: number
  total: number
  /** 0..1 across the whole preset */
  progress: number
  done: boolean
  error?: string
}

export interface AsrStatusResult {
  running: boolean
  ready: boolean
  cached: boolean
  presetId: string
  totalBytes: number
}

/** Typed facade on `window.lp`. */
export interface LPApi {
  store: {
    load(): Promise<StoreFile>
    save(store: StoreFile): Promise<{ ok: boolean; savedAt: string }>
    reveal(): Promise<{ path: string }>
  }
  dialog: {
    confirm(req: ConfirmRequest): Promise<{ confirmed: boolean }>
  }
  shell: {
    openExternal(url: string): Promise<void>
  }
  window: {
    setFullScreen(on: boolean): Promise<{ ok: boolean }>
    isFullScreen(): Promise<{ fullScreen: boolean }>
    onBoundsChanged(cb: (bounds: WindowBounds) => void): () => void
  }
  media: {
    requestMicAccess(): Promise<{ granted: boolean }>
  }
  asr: {
    start(presetId: string): Promise<{ cached: boolean }>
    stop(): Promise<{ ok: boolean }>
    status(presetId: string): Promise<AsrStatusResult>
    /** Fire-and-forget PCM feed (mono Float32, transferred as ArrayBuffer). */
    feed(pcm: ArrayBuffer, sampleRate: number): void
    downloadModel(presetId: string): Promise<{ started: boolean }>
    cancelDownload(presetId: string): Promise<{ ok: boolean }>
    deleteModel(presetId: string): Promise<{ ok: boolean }>
    onPartial(cb: (p: AsrPartialEvent) => void): () => void
    onState(cb: (s: AsrStateEvent) => void): () => void
    onModelProgress(cb: (p: AsrModelProgressEvent) => void): () => void
  }
}
