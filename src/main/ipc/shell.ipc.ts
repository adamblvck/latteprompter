import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'

export function registerShellIpc(): void {
  ipcMain.handle(IPC.shell.openExternal, async (_e, { url }: { url: string }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) await shell.openExternal(url)
  })
}
