import { app } from 'electron'
import { join } from 'path'

export function dataDir(): string {
  return app.getPath('userData')
}

export function storePath(): string {
  return join(dataDir(), 'store.json')
}

export function storeTmpPath(): string {
  return join(dataDir(), 'store.json.tmp')
}

export function storeBakPath(): string {
  return join(dataDir(), 'store.json.bak')
}

/** Streaming ASR models live under userData/models/asr/<preset.dir>/ */
export function asrModelsDir(): string {
  return join(dataDir(), 'models', 'asr')
}
