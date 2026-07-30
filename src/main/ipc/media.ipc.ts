import { ipcMain, systemPreferences } from 'electron'
import { IPC } from '@shared/ipc'

export function registerMediaIpc(): void {
  ipcMain.handle(IPC.media.requestMicAccess, async () => {
    if (process.platform !== 'darwin') return { granted: true }
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return { granted: true }
    if (status === 'not-determined') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return { granted }
    }
    return { granted: false }
  })
}
