/*
 * Microphone capture worklet (ported from talktome). Runs on the audio thread:
 * batches 128-frame render quanta into ~64 ms packets and ships them (with an
 * RMS level for the live meter) to the renderer.
 */

const BATCH = 1024

class LpRecCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Float32Array(BATCH)
    this.fill = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    let read = 0
    while (read < ch.length) {
      const n = Math.min(BATCH - this.fill, ch.length - read)
      this.buf.set(ch.subarray(read, read + n), this.fill)
      this.fill += n
      read += n
      if (this.fill === BATCH) {
        let sum = 0
        for (let i = 0; i < BATCH; i++) sum += this.buf[i] * this.buf[i]
        const out = this.buf.slice()
        this.port.postMessage({ samples: out.buffer, rms: Math.sqrt(sum / BATCH) }, [out.buffer])
        this.fill = 0
      }
    }
    return true
  }
}

registerProcessor('lp-rec-capture', LpRecCapture)
