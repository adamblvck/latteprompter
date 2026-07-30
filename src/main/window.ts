import { BrowserWindow, screen, shell } from 'electron'
import type { WindowBounds } from '@shared/types'

const mac = process.platform === 'darwin'

let win: BrowserWindow | null = null
let boundsTimer: NodeJS.Timeout | null = null

export function getWindow(): BrowserWindow | null {
  return win
}

function clampToDisplay(b: WindowBounds): WindowBounds {
  const area = screen.getDisplayMatching(b).workArea
  const width = Math.min(b.width, area.width)
  const height = Math.min(b.height, area.height)
  const x = Math.min(Math.max(b.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(b.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

export function createWindow(opts: {
  preload: string
  rendererUrl?: string
  rendererFile?: string
  rendererQuery?: string
  savedBounds: WindowBounds | null
}): BrowserWindow {
  const bounds = opts.savedBounds ? clampToDisplay(opts.savedBounds) : undefined

  win = new BrowserWindow({
    width: bounds?.width ?? 1040,
    height: bounds?.height ?? 720,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 720,
    minHeight: 520,
    ...(mac
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 13 } }
      : { frame: false }),
    backgroundColor: '#12151A',
    show: false,
    webPreferences: {
      preload: opts.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win?.show())

  // External links open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const pushBounds = (): void => {
    if (!win || win.isFullScreen() || win.isMaximized()) return
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isFullScreen()) return
      const b = win.getBounds()
      win.webContents.send('window:onBoundsChanged', b)
    }, 250)
  }
  win.on('resize', pushBounds)
  win.on('move', pushBounds)

  if (opts.rendererUrl) win.loadURL(opts.rendererUrl)
  else if (opts.rendererFile) {
    win.loadFile(opts.rendererFile, opts.rendererQuery ? { search: opts.rendererQuery } : undefined)
  }

  return win
}

export function setFullScreen(on: boolean): void {
  win?.setFullScreen(on)
}

export function isFullScreen(): boolean {
  return win?.isFullScreen() ?? false
}
