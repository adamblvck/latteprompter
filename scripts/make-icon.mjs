/**
 * Generates resources/appIcon.png (512×512) — a dark rounded square with the
 * LatePrompter "line-bar over text" mark. Run: npx electron scripts/make-icon.mjs
 */
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const out = join(dirname(fileURLToPath(import.meta.url)), '../resources/appIcon.png')

const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:512px;height:512px;background:transparent}
  .tile{width:512px;height:512px;border-radius:116px;
    background:linear-gradient(160deg,#1a212a 0%,#12151a 70%);
    display:flex;flex-direction:column;justify-content:center;gap:34px;
    padding:0 88px;box-sizing:border-box;border:2px solid #2a3340}
  .line{height:26px;border-radius:13px;background:#3c4a59}
  .line.short{width:62%}
  .line.current{background:#fcbd3f;width:100%;height:34px;border-radius:17px;
    box-shadow:0 0 42px rgba(252,189,63,.55)}
  .line.dim{opacity:.45;width:80%}
</style><body><div class="tile">
  <div class="line dim"></div>
  <div class="line dim short"></div>
  <div class="line current"></div>
  <div class="line"></div>
  <div class="line short"></div>
</div></body>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 600))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  writeFileSync(out, image.toPNG())
  console.log('wrote', out, image.getSize())
  app.exit(0)
})
