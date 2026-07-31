import { app, session } from 'electron'
import { join } from 'path'
import { createWindow, getWindow } from './window'
import { registerIpc } from './ipc'
import { loadStore } from './services/storeService'
import { killAsr } from './services/asrEngine'

// One consistent userData dir (dev, packaged, and direct `electron out/...` runs).
app.setName('LattePrompter')

// Dev affordance alongside LP_CAPTURE/LP_SCENE: point userData at a scratch
// dir to exercise fresh-install states without touching real data.
if (process.env['LP_USERDATA']) {
  app.setPath('userData', process.env['LP_USERDATA'])
}

// Capture runs are ephemeral — they must not be blocked by (or steal) the lock.
const gotLock = process.env['LP_CAPTURE'] ? true : app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(async () => {
    // Lock the page down when packaged; dev stays open for Vite HMR.
    if (app.isPackaged) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
                "font-src 'self' data:; script-src 'self'; media-src 'self'"
            ]
          }
        })
      })
    }

    const store = await loadStore()
    registerIpc()

    // LP_SCENE=settings|prompter jumps straight to a screen — used with
    // LP_CAPTURE for headless visual verification and README screenshots.
    const scene = process.env['LP_SCENE']
    const sceneQuery = scene ? `?scene=${scene}` : ''
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    const win = createWindow({
      preload: join(__dirname, '../preload/index.js'),
      rendererUrl: rendererUrl ? rendererUrl + sceneQuery : undefined,
      rendererFile: rendererUrl ? undefined : join(__dirname, '../renderer/index.html'),
      rendererQuery: sceneQuery,
      savedBounds: store.ui.windowBounds
    })

    // Headless visual verification: LP_CAPTURE=/path/out.png captures the
    // window after load and quits. Dev affordance, harmless in production.
    const capturePath = process.env['LP_CAPTURE']
    if (capturePath) {
      const delay = Number(process.env['LP_CAPTURE_DELAY'] ?? 1200)
      win.webContents.on('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const image = await win.webContents.capturePage()
            const { writeFileSync } = await import('fs')
            writeFileSync(capturePath, image.toPNG())
          } finally {
            app.quit()
          }
        }, delay)
      })
    }
  })

  app.on('second-instance', () => {
    const win = getWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.on('before-quit', () => {
    killAsr()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
