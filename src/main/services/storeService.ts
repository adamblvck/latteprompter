import { promises as fs } from 'fs'
import { dirname } from 'path'
import { storeBakPath, storePath, storeTmpPath } from './paths'
import { createDefaultStore, hydrateStore } from '@shared/factory'
import { SCHEMA_VERSION, type StoreFile } from '@shared/types'

async function ensureDirs(): Promise<void> {
  await fs.mkdir(dirname(storePath()), { recursive: true })
}

export function migrate(store: StoreFile): StoreFile {
  // Schema v1 — no migrations yet. Structure kept so future versions add
  // one `if ((store.schemaVersion ?? 1) < N) { ... }` block per step.
  if (!store.schemaVersion || store.schemaVersion < SCHEMA_VERSION) {
    store.schemaVersion = SCHEMA_VERSION
  }
  return store
}

export async function loadStore(): Promise<StoreFile> {
  await ensureDirs()
  // primary
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    return migrate(hydrateStore(JSON.parse(raw) as StoreFile))
  } catch {
    /* fall through to backup */
  }
  // backup
  try {
    const raw = await fs.readFile(storeBakPath(), 'utf8')
    return migrate(hydrateStore(JSON.parse(raw) as StoreFile))
  } catch {
    /* fall through to seed */
  }
  const seed = createDefaultStore()
  await saveStore(seed)
  return seed
}

/** Atomic write: copy current → .bak, write .tmp + fsync, rename over store.json. */
export async function saveStore(store: StoreFile): Promise<{ ok: boolean; savedAt: string }> {
  await ensureDirs()
  const savedAt = new Date().toISOString()
  const toWrite: StoreFile = { ...store, schemaVersion: SCHEMA_VERSION, savedAt }
  const json = JSON.stringify(toWrite, null, 2)

  // keep the previous good copy as .bak
  try {
    await fs.copyFile(storePath(), storeBakPath())
  } catch {
    /* first save: no existing store.json yet */
  }

  const handle = await fs.open(storeTmpPath(), 'w')
  try {
    await handle.writeFile(json, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(storeTmpPath(), storePath())
  return { ok: true, savedAt }
}
