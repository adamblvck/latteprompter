import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { isFullScreen, setFullScreen } from '../window'

export function registerWindowIpc(): void {
  ipcMain.handle(IPC.window.setFullScreen, async (_e, { on }: { on: boolean }) => {
    setFullScreen(on)
    return { ok: true }
  })
  ipcMain.handle(IPC.window.isFullScreen, async () => ({ fullScreen: isFullScreen() }))
}
