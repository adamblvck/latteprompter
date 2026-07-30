/**
 * ASR engine harness — validates the streaming pipeline without any UI.
 * Runs as an Electron script so utilityProcess matches production exactly:
 *
 *   npm run build
 *   npx electron scripts/asr-harness.mjs [path/to.wav]
 *
 * Without a wav argument it synthesizes one with macOS `say`. Downloads the
 * model to the app's real models dir on first run (~73 MB). Prints every
 * partial the worker emits, then exits 0 when the transcript looks sane.
 */
import { app, utilityProcess } from 'electron'
import { execFileSync } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, renameSync } from 'fs'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const PRESET = {
  id: 'nemo-streaming-en',
  repo: 'csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-80ms',
  dir: 'nemo-streaming-fast-conformer-transducer-en-80ms',
  files: ['tokens.txt', 'decoder.onnx', 'joiner.onnx', 'encoder.onnx']
}

const TEST_TEXT = 'good evening everyone and welcome to the show tonight we talk about the future'

app.setName('lateprompter') // share the real app's userData/models dir

function parseWav(path) {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a wav file')
  let off = 12
  let fmt = null
  let data = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22)
      }
    } else if (id === 'data') {
      data = buf.subarray(off + 8, off + 8 + size)
    }
    off += 8 + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('wav missing fmt/data chunks')
  let pcm
  if (fmt.format === 3 && fmt.bits === 32) {
    pcm = new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  } else if (fmt.format === 1 && fmt.bits === 16) {
    const i16 = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    pcm = Float32Array.from(i16, (v) => v / 32768)
  } else {
    throw new Error(`unsupported wav format ${fmt.format}/${fmt.bits}`)
  }
  if (fmt.channels > 1) {
    const mono = new Float32Array(Math.floor(pcm.length / fmt.channels))
    for (let i = 0; i < mono.length; i++) pcm[i] = pcm[i * fmt.channels]
    pcm = mono
  }
  return { pcm, sampleRate: fmt.sampleRate }
}

async function ensureModel(modelsDir) {
  const dir = join(modelsDir, PRESET.dir)
  mkdirSync(dir, { recursive: true })
  for (const name of PRESET.files) {
    const dest = join(dir, name)
    if (existsSync(dest) && statSync(dest).size > 0) continue
    const url = `https://huggingface.co/${PRESET.repo}/resolve/main/${name}`
    console.log(`downloading ${name}…`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`)
    const tmp = dest + '.part'
    await finished(Readable.fromWeb(res.body).pipe(createWriteStream(tmp)))
    renameSync(tmp, dest)
    console.log(`  ✓ ${name} (${statSync(dest).size} bytes)`)
  }
  return modelsDir
}

async function main() {
  await app.whenReady()

  let wavPath = process.argv[2]
  if (!wavPath) {
    wavPath = join(app.getPath('temp'), 'lp-harness.wav')
    console.log(`synthesizing test speech with \`say\`: "${TEST_TEXT}"`)
    execFileSync('say', [
      '-o',
      wavPath,
      '--file-format=WAVE',
      '--data-format=LEI16@16000',
      TEST_TEXT
    ])
  }

  const modelsDir = await ensureModel(join(app.getPath('userData'), 'models', 'asr'))
  const { pcm, sampleRate } = parseWav(wavPath)
  console.log(`wav: ${pcm.length} samples @ ${sampleRate} Hz (${(pcm.length / sampleRate).toFixed(1)}s)`)

  const worker = utilityProcess.fork(join(root, 'out/main/asrWorker.js'), [], {
    serviceName: 'lp-harness-asr'
  })

  const partials = []
  let ready = false

  const done = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('harness timeout (60s)')), 60000)
    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        ready = true
        console.log('engine ready — feeding audio in 256 ms slices')
        feed()
      } else if (msg.type === 'partial') {
        partials.push(msg)
        console.log(
          `  [u${msg.utteranceId} #${msg.seq}${msg.isFinal ? ' FINAL' : ''}] ${msg.text}`
        )
        if (msg.isFinal) {
          clearTimeout(timeout)
          resolve()
        }
      } else if (msg.type === 'error') {
        clearTimeout(timeout)
        reject(new Error(`worker error: ${msg.message}`))
      }
    })
    worker.on('exit', (code) => {
      if (!ready) reject(new Error(`worker exited early (${code})`))
    })
  })

  function feed() {
    const CHUNK = 4096
    for (let off = 0; off < pcm.length; off += CHUNK) {
      const slice = pcm.slice(off, off + CHUNK)
      worker.postMessage({ type: 'feed', pcm: slice.buffer, sampleRate })
    }
    // trailing silence lets the endpoint rule fire, then flush as a backstop
    const silence = new Float32Array(16000 * 2)
    for (let off = 0; off < silence.length; off += CHUNK) {
      worker.postMessage({ type: 'feed', pcm: silence.slice(off, off + CHUNK).buffer, sampleRate: 16000 })
    }
    worker.postMessage({ type: 'flush' })
  }

  worker.postMessage({ type: 'init', modelsDir, presetId: PRESET.id })

  try {
    await done
    const finalText = partials.filter((p) => p.isFinal).map((p) => p.text).join(' ')
    console.log(`\nfinal transcript: "${finalText}"`)
    const gotPartials = partials.length >= 2
    const mentionsShow = /evening|welcome|show|future/i.test(finalText)
    if (gotPartials && mentionsShow) {
      console.log(`✓ PASS — ${partials.length} incremental partials, transcript matches`)
      worker.kill()
      app.exit(0)
    } else {
      console.log(`✗ FAIL — partials=${partials.length}, transcript match=${mentionsShow}`)
      worker.kill()
      app.exit(1)
    }
  } catch (err) {
    console.error(String(err))
    worker.kill()
    app.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
