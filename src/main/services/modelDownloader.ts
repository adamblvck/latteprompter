/**
 * Resumable HuggingFace model downloader (ported from talktome's asr.js).
 * Downloads to `<file>.part`, resumes via HTTP Range, follows redirects (≤5),
 * verifies by size equality, renames into place. Progress spans the whole
 * preset so the UI can show one continuous bar across all files.
 */
import fs from 'fs'
import path from 'path'
import https from 'https'
import { downloadPlan, fileUrl, type AsrPreset } from '@shared/asr-models'

export function statSize(file: string): number | null {
  try {
    return fs.statSync(file).size
  } catch {
    return null
  }
}

export interface DownloadProgress {
  file: string
  loaded: number
  total: number
  progress: number
  done: boolean
}

interface ActiveDownload {
  cancelled: boolean
  request: ReturnType<typeof https.get> | null
}

const active = new Map<string, ActiveDownload>()

function downloadFile(
  url: string,
  dest: string,
  expectedBytes: number,
  onBytes: (n: number) => void,
  state: ActiveDownload,
  redirects = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'))
    if (state.cancelled) return reject(new Error('cancelled'))
    const part = dest + '.part'
    const have = statSize(part) ?? 0
    const headers: Record<string, string> = { 'user-agent': 'lateprompter' }
    if (have > 0 && have < expectedBytes) headers.range = `bytes=${have}-`

    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(
          downloadFile(
            new URL(res.headers.location, url).href,
            dest,
            expectedBytes,
            onBytes,
            state,
            redirects + 1
          )
        )
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume()
        return reject(new Error(`Download failed (HTTP ${res.statusCode}) for ${path.basename(dest)}`))
      }
      const resuming = res.statusCode === 206
      if (resuming) onBytes(have) // count what's already on disk
      const out = fs.createWriteStream(part, { flags: resuming ? 'a' : 'w' })
      res.on('data', (buf: Buffer) => {
        if (state.cancelled) {
          req.destroy()
          out.destroy()
          return reject(new Error('cancelled'))
        }
        onBytes(buf.length)
      })
      res.pipe(out)
      out.on('finish', () => {
        out.close(() => {
          const size = statSize(part)
          if (size !== expectedBytes) {
            return reject(
              new Error(`Size mismatch for ${path.basename(dest)}: got ${size}, expected ${expectedBytes}`)
            )
          }
          try {
            fs.renameSync(part, dest)
            resolve()
          } catch (err) {
            reject(err)
          }
        })
      })
      res.on('error', reject)
      out.on('error', reject)
    })
    state.request = req
    req.on('error', reject)
  })
}

export async function ensureModelFiles(
  preset: AsrPreset,
  modelDir: string,
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  fs.mkdirSync(modelDir, { recursive: true })
  const plan = downloadPlan(preset, (name) => statSize(path.join(modelDir, name)))
  if (plan.complete) {
    onProgress({ file: '', loaded: plan.totalBytes, total: plan.totalBytes, progress: 1, done: true })
    return
  }

  const state: ActiveDownload = { cancelled: false, request: null }
  active.set(preset.id, state)

  let loaded = plan.doneBytes
  let lastSent = 0
  const report = (file: string, done = false): void => {
    const now = Date.now()
    if (!done && now - lastSent < 250 && loaded < plan.totalBytes) return
    lastSent = now
    onProgress({
      file,
      loaded,
      total: plan.totalBytes,
      progress: plan.totalBytes ? loaded / plan.totalBytes : 0,
      done
    })
  }

  try {
    for (const f of plan.missing) {
      if (state.cancelled) throw new Error('cancelled')
      // A stale partial from an older attempt may exceed the expected size.
      const partPath = path.join(modelDir, f.name) + '.part'
      if ((statSize(partPath) ?? 0) > f.bytes) {
        try {
          fs.unlinkSync(partPath)
        } catch {}
      }
      report(f.name)
      await downloadFile(
        fileUrl(preset, f.name),
        path.join(modelDir, f.name),
        f.bytes,
        (n) => {
          loaded += n
          report(f.name)
        },
        state
      )
    }
    report('', true)
  } finally {
    active.delete(preset.id)
  }
}

export function cancelDownload(presetId: string): boolean {
  const state = active.get(presetId)
  if (!state) return false
  state.cancelled = true
  state.request?.destroy()
  return true
}

export function isDownloading(presetId: string): boolean {
  return active.has(presetId)
}

/** Delete a preset's model directory (keeps .part files out of the way too). */
export function deleteModelDir(modelDir: string): void {
  fs.rmSync(modelDir, { recursive: true, force: true })
}
