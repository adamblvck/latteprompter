import { dialog, ipcMain } from 'electron'
import { IPC, type ConfirmRequest } from '@shared/ipc'
import { getWindow } from '../window'

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.dialog.confirm, async (_e, { req }: { req: ConfirmRequest }) => {
    const win = getWindow()
    if (!win) return { confirmed: false }
    const result = await dialog.showMessageBox(win, {
      type: req.danger ? 'warning' : 'question',
      message: req.title,
      detail: req.message,
      buttons: [req.confirmLabel ?? 'OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    })
    return { confirmed: result.response === 0 }
  })
}
