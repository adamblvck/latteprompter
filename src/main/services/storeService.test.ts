import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let dir = ''

vi.mock('./paths', () => ({
  dataDir: () => dir,
  storePath: () => join(dir, 'store.json'),
  storeTmpPath: () => join(dir, 'store.json.tmp'),
  storeBakPath: () => join(dir, 'store.json.bak'),
  asrModelsDir: () => join(dir, 'models', 'asr')
}))

import { loadStore, saveStore, migrate } from './storeService'
import { createDefaultStore } from '@shared/factory'
import { SCHEMA_VERSION } from '@shared/types'

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lp-store-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('storeService', () => {
  it('seeds a default store when nothing exists', async () => {
    const store = await loadStore()
    expect(store.schemaVersion).toBe(SCHEMA_VERSION)
    expect(Object.keys(store.scripts).length).toBeGreaterThan(0)
    // seed is persisted
    const onDisk = JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8'))
    expect(onDisk.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('round-trips a save and load', async () => {
    const store = createDefaultStore()
    store.ui.themeMode = 'light'
    await saveStore(store)
    const loaded = await loadStore()
    expect(loaded.ui.themeMode).toBe('light')
  })

  it('keeps a .bak of the previous good copy', async () => {
    const a = createDefaultStore()
    await saveStore(a)
    const b = { ...a, ui: { ...a.ui, themeMode: 'light' as const } }
    await saveStore(b)
    const bak = JSON.parse(readFileSync(join(dir, 'store.json.bak'), 'utf8'))
    expect(bak.ui.themeMode).toBe('dark')
  })

  it('falls back to the backup when the primary is corrupt', async () => {
    const a = createDefaultStore()
    await saveStore(a)
    await saveStore(a) // creates .bak
    writeFileSync(join(dir, 'store.json'), '{corrupt', 'utf8')
    const loaded = await loadStore()
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('migrate stamps old versions up to current', () => {
    const store = createDefaultStore()
    store.schemaVersion = 0
    expect(migrate(store).schemaVersion).toBe(SCHEMA_VERSION)
  })
})
