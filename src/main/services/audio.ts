/** Small pure audio helpers (ported from talktome's audio.js). */

/** Linear resampler — safety net when the capture rate isn't 16 kHz. */
export function resampleLinear(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return pcm
  const outLen = Math.max(1, Math.round((pcm.length * toRate) / fromRate))
  const out = new Float32Array(outLen)
  const ratio = (pcm.length - 1) / Math.max(1, outLen - 1)
  for (let i = 0; i < outLen; i++) {
    const t = i * ratio
    const i0 = Math.floor(t)
    const i1 = Math.min(pcm.length - 1, i0 + 1)
    const frac = t - i0
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac
  }
  return out
}
