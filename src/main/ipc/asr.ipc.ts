import { ipcMain } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import { ASR_PRESETS, presetById } from '@shared/asr-models'
import { getWindow } from '../window'
import { asrModelsDir } from '../services/paths'
import {
  asrCached,
  asrStatus,
  feedAsr,
  killAsr,
  setAsrEmitter,
  startAsr,
  stopAsr
} from '../services/asrEngine'
import {
  cancelDownload,
  deleteModelDir,
  ensureModelFiles,
  isDownloading
} from '../services/modelDownloader'

function sendToWindow(channel: string, payload: unknown): void {
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function registerAsrIpc(): void {
  setAsrEmitter({
    partial: (p) => sendToWindow(IPC.asr.partial, p),
    state: (s) => sendToWindow(IPC.asr.state, s)
  })

  ipcMain.handle(IPC.asr.start, async (_e, { presetId }: { presetId: string }) =>
    startAsr(presetId)
  )
  ipcMain.handle(IPC.asr.stop, async () => {
    stopAsr()
    return { ok: true }
  })
  ipcMain.handle(IPC.asr.status, async (_e, { presetId }: { presetId: string }) =>
    asrStatus(presetId)
  )
  ipcMain.handle(IPC.asr.statusAll, async () =>
    ASR_PRESETS.map((p) => ({ presetId: p.id, cached: asrCached(p.id) }))
  )

  // Fire-and-forget PCM feed — send/on, not invoke, to skip promise overhead.
  ipcMain.on(IPC.asr.feed, (_e, { pcm, sampleRate }: { pcm: ArrayBuffer; sampleRate: number }) => {
    feedAsr(pcm, sampleRate)
  })

  ipcMain.handle(IPC.asr.downloadModel, async (_e, { presetId }: { presetId: string }) => {
    const preset = presetById(presetId)
    if (!preset || isDownloading(presetId)) return { started: false }
    const modelDir = join(asrModelsDir(), preset.dir)
    // Runs in the background; progress and completion stream over events.
    void ensureModelFiles(preset, modelDir, (p) => {
      sendToWindow(IPC.asr.modelProgress, { presetId, ...p })
    }).catch((err: Error) => {
      sendToWindow(IPC.asr.modelProgress, {
        presetId,
        file: '',
        loaded: 0,
        total: 0,
        progress: 0,
        done: false,
        error: err.message === 'cancelled' ? 'cancelled' : err.message
      })
    })
    return { started: true }
  })

  ipcMain.handle(IPC.asr.cancelDownload, async (_e, { presetId }: { presetId: string }) => ({
    ok: cancelDownload(presetId)
  }))

  ipcMain.handle(IPC.asr.deleteModel, async (_e, { presetId }: { presetId: string }) => {
    const preset = presetById(presetId)
    if (!preset) return { ok: false }
    killAsr()
    deleteModelDir(join(asrModelsDir(), preset.dir))
    return { ok: true }
  })
}
