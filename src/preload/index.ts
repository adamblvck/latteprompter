import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type LPApi } from '@shared/ipc'
import type { StoreFile } from '@shared/types'

/** Main→renderer events go through this whitelist; unknown channels no-op. */
const RECEIVE_CHANNELS = new Set<string>([
  IPC.window.boundsChanged,
  IPC.asr.partial,
  IPC.asr.state,
  IPC.asr.modelProgress
])

function subscribe(channel: string, cb: (payload: any) => void): () => void {
  if (!RECEIVE_CHANNELS.has(channel)) return () => {}
  const listener = (_e: unknown, payload: any): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LPApi = {
  store: {
    load: () => ipcRenderer.invoke(IPC.store.load),
    save: (store: StoreFile) => ipcRenderer.invoke(IPC.store.save, { store }),
    reveal: () => ipcRenderer.invoke(IPC.store.reveal)
  },
  dialog: {
    confirm: (req) => ipcRenderer.invoke(IPC.dialog.confirm, { req })
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(IPC.shell.openExternal, { url })
  },
  window: {
    setFullScreen: (on) => ipcRenderer.invoke(IPC.window.setFullScreen, { on }),
    isFullScreen: () => ipcRenderer.invoke(IPC.window.isFullScreen),
    onBoundsChanged: (cb) => subscribe(IPC.window.boundsChanged, cb)
  },
  media: {
    requestMicAccess: () => ipcRenderer.invoke(IPC.media.requestMicAccess)
  },
  asr: {
    start: (presetId) => ipcRenderer.invoke(IPC.asr.start, { presetId }),
    stop: () => ipcRenderer.invoke(IPC.asr.stop),
    status: (presetId) => ipcRenderer.invoke(IPC.asr.status, { presetId }),
    feed: (pcm, sampleRate) => ipcRenderer.send(IPC.asr.feed, { pcm, sampleRate }),
    downloadModel: (presetId) => ipcRenderer.invoke(IPC.asr.downloadModel, { presetId }),
    cancelDownload: (presetId) => ipcRenderer.invoke(IPC.asr.cancelDownload, { presetId }),
    deleteModel: (presetId) => ipcRenderer.invoke(IPC.asr.deleteModel, { presetId }),
    onPartial: (cb) => subscribe(IPC.asr.partial, cb),
    onState: (cb) => subscribe(IPC.asr.state, cb),
    onModelProgress: (cb) => subscribe(IPC.asr.modelProgress, cb)
  }
}

contextBridge.exposeInMainWorld('lp', api)
