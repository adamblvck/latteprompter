import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { StoreFile } from '@shared/types'
import { loadStore, saveStore } from '../services/storeService'
import { dataDir } from '../services/paths'

export function registerStoreIpc(): void {
  ipcMain.handle(IPC.store.load, async () => loadStore())
  ipcMain.handle(IPC.store.save, async (_e, { store }: { store: StoreFile }) => saveStore(store))
  ipcMain.handle(IPC.store.reveal, async () => {
    shell.showItemInFolder(dataDir())
    return { path: dataDir() }
  })
}
