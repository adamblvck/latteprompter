/**
 * Microphone capture: getUserMedia → 16 kHz AudioContext → AudioWorklet.
 * The worklet ships ~64 ms Float32 packets with a precomputed RMS; we coalesce
 * four packets (~256 ms) per ASR feed to keep IPC chatter low.
 */

export interface MicSession {
  sampleRate: number
  stop: () => void
}

export class MicError extends Error {
  constructor(
    message: string,
    public readonly code: 'denied' | 'not-found' | 'busy' | 'unknown'
  ) {
    super(message)
  }
}

const FEED_BATCH = 4 // worklet packets per ASR feed (~256 ms)

export async function startMic(opts: {
  deviceId: string | null
  onLevel: (rms: number) => void
  onPcm: (pcm: Float32Array, sampleRate: number) => void
}): Promise<MicSession> {
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }

  let stream: MediaStream
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: opts.deviceId ? { ...base, deviceId: { exact: opts.deviceId } } : base
      })
    } catch (err) {
      // The chosen device may have vanished — silently fall back to default.
      if (opts.deviceId && (err as Error).name === 'OverconstrainedError') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: base })
      } else {
        throw err
      }
    }
  } catch (err) {
    const name = (err as Error).name
    if (name === 'NotAllowedError')
      throw new MicError('Microphone access was denied.', 'denied')
    if (name === 'NotFoundError') throw new MicError('No microphone found.', 'not-found')
    if (name === 'NotReadableError')
      throw new MicError('The microphone is busy in another app.', 'busy')
    throw new MicError(String((err as Error).message ?? err), 'unknown')
  }

  const ctx = new AudioContext({ sampleRate: 16000 })
  await ctx.audioWorklet.addModule('./rec-worklet.js')
  const src = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'lp-rec-capture', { numberOfOutputs: 0 })

  const pending: Float32Array[] = []
  node.port.onmessage = ({ data }: MessageEvent<{ samples: ArrayBuffer; rms: number }>) => {
    // speech RMS ≈ 0.03–0.3 → scale into a usable 0..1 meter range
    opts.onLevel(Math.min(1, data.rms * 3.2))
    pending.push(new Float32Array(data.samples))
    if (pending.length >= FEED_BATCH) {
      const total = pending.reduce((n, p) => n + p.length, 0)
      const merged = new Float32Array(total)
      let off = 0
      for (const p of pending) {
        merged.set(p, off)
        off += p.length
      }
      pending.length = 0
      opts.onPcm(merged, ctx.sampleRate)
    }
  }
  src.connect(node)

  return {
    sampleRate: ctx.sampleRate,
    stop: () => {
      try {
        node.port.onmessage = null
        src.disconnect()
        node.disconnect()
      } catch {}
      stream.getTracks().forEach((t) => t.stop())
      ctx.close().catch(() => {})
    }
  }
}
