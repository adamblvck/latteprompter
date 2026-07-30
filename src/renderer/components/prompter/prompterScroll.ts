/**
 * rAF scroll follower for the prompter. Exponential approach toward a target
 * scrollTop — smooth, interruptible, and immune to the restart stutter that
 * CSS smooth-scrolling produces when the target changes 2–3× per second.
 */

const TAU_MS = 280 // approach time constant
const DEADBAND_PX = 8
export const EYE_LINE = 0.38 // fraction of viewport height from the top

export class PrompterScroller {
  private el: HTMLElement
  private raf = 0
  private lastT = 0
  private target: number | null = null
  private constantPxPerSec: number | null = null
  private following = true
  private suppressScrollEvents = 0
  onManual: (() => void) | null = null

  constructor(el: HTMLElement) {
    this.el = el
    el.addEventListener('wheel', this.handleManual, { passive: true })
    el.addEventListener('touchmove', this.handleManual, { passive: true })
  }

  destroy(): void {
    this.stop()
    this.el.removeEventListener('wheel', this.handleManual)
    this.el.removeEventListener('touchmove', this.handleManual)
  }

  private handleManual = (): void => {
    if (!this.following) return
    this.following = false
    this.onManual?.()
  }

  /** External manual action (arrow keys) — same pause semantics as the wheel. */
  manualInterrupt(): void {
    this.handleManual()
  }

  get isFollowing(): boolean {
    return this.following
  }

  resumeFollowing(): void {
    this.following = true
  }

  /** Aim the eye-line at a content Y position (offsetTop inside the scroller). */
  setTargetTop(contentY: number, opts: { allowBackward?: boolean } = {}): void {
    const next = Math.max(0, contentY - this.el.clientHeight * EYE_LINE)
    if (!opts.allowBackward && this.target !== null && next < this.target - DEADBAND_PX) return
    this.target = next
  }

  setConstantSpeed(pxPerSec: number | null): void {
    this.constantPxPerSec = pxPerSec
    if (pxPerSec !== null && this.target === null) this.target = this.el.scrollTop
  }

  start(): void {
    if (this.raf) return
    this.lastT = performance.now()
    const tick = (t: number): void => {
      const dt = Math.min(100, t - this.lastT)
      this.lastT = t
      if (this.following) {
        if (this.constantPxPerSec !== null && this.target !== null) {
          this.target += (this.constantPxPerSec * dt) / 1000
        }
        if (this.target !== null) {
          const current = this.el.scrollTop
          const diff = this.target - current
          if (Math.abs(diff) > 0.5) {
            const step = diff * (1 - Math.exp(-dt / TAU_MS))
            this.el.scrollTop = current + (Math.abs(step) < 0.1 ? Math.sign(diff) * 0.1 : step)
          }
        }
      }
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /** Sync target to wherever the user manually scrolled before resuming. */
  adoptCurrentPosition(): void {
    this.target = this.el.scrollTop
  }
}
