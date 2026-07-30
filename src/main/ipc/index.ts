import { registerStoreIpc } from './store.ipc'
import { registerDialogIpc } from './dialog.ipc'
import { registerShellIpc } from './shell.ipc'
import { registerWindowIpc } from './window.ipc'
import { registerMediaIpc } from './media.ipc'
import { registerAsrIpc } from './asr.ipc'

export function registerIpc(): void {
  registerStoreIpc()
  registerDialogIpc()
  registerShellIpc()
  registerWindowIpc()
  registerMediaIpc()
  registerAsrIpc()
}
