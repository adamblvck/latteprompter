import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Play } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { parseScript } from '@shared/script'
import { ScriptAligner, type AlignerOutput, type AlignerState } from '@shared/aligner'
import { resolvePrompterSettings, type ScrollMode } from '@shared/types'
import { fontById } from '@shared/fonts'
import { DEFAULT_PRESET_ID, presetTotalBytes, presetById } from '@shared/asr-models'
import type { AsrModelProgressEvent } from '@shared/ipc'
import { useAsr } from '@renderer/hooks/useAsr'
import { PrompterScroller, EYE_LINE } from './prompterScroll'

type Phase = 'model-check' | 'countdown' | 'live'

export default function PrompterView({ scriptId }: { scriptId: string }): React.JSX.Element | null {
  const script = useStore((s) => s.store?.scripts[scriptId])
  const defaults = useStore((s) => s.store?.settings.prompterDefaults)
  const asrSettings = useStore((s) => s.store?.settings.asr)
  const exitPrompter = useStore((s) => s.exitPrompter)
  const showToast = useStore((s) => s.showToast)

  const settings = useMemo(
    () => (defaults ? resolvePrompterSettings(defaults, script?.promptOverrides ?? null) : null),
    [defaults, script?.promptOverrides]
  )

  const parsed = useMemo(() => (script ? parseScript(script.body) : null), [script])

  const [mode, setMode] = useState<ScrollMode>(settings?.scrollMode ?? 'manual')
  const [phase, setPhase] = useState<Phase>('model-check')
  const [countdown, setCountdown] = useState(3)
  const [pausedPill, setPausedPill] = useState(false)
  const [alignState, setAlignState] = useState<AlignerState>('tracking')
  const [modelModal, setModelModal] = useState(false)
  const [dlProgress, setDlProgress] = useState<AsrModelProgressEvent | null>(null)
  const [lineBar, setLineBar] = useState<{ top: number; height: number } | null>(null)

  const scrollerElRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<PrompterScroller | null>(null)
  const spansRef = useRef<HTMLElement[]>([])
  const prevTentativeRef = useRef(-1)
  const alignerRef = useRef<ScriptAligner | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  const presetId = asrSettings?.modelId ?? DEFAULT_PRESET_ID

  // ---- aligner output → highlights + line bar + scroll target ----
  const applyOutput = useCallback((out: AlignerOutput) => {
    setAlignState(out.state)
    const spans = spansRef.current
    if (spans.length === 0) return
    const newT = Math.min(out.tentativeDisplay, spans.length - 1)
    const prevT = prevTentativeRef.current
    if (newT !== prevT) {
      if (newT > prevT) {
        for (let i = Math.max(0, prevT + 1); i <= newT; i++) spans[i].classList.add('read')
      } else {
        for (let i = newT + 1; i <= prevT && i < spans.length; i++) spans[i].classList.remove('read')
      }
      const prevCur = Math.min(prevT + 1, spans.length - 1)
      if (prevCur >= 0) spans[prevCur]?.classList.remove('current')
      const cur = Math.min(newT + 1, spans.length - 1)
      const curSpan = spans[Math.max(0, cur)]
      if (curSpan) {
        curSpan.classList.add('current')
        setLineBar({ top: curSpan.offsetTop - 4, height: curSpan.offsetHeight + 8 })
        scrollerRef.current?.setTargetTop(curSpan.offsetTop, { allowBackward: newT < prevT })
      }
      prevTentativeRef.current = newT
    }
  }, [])

  const degradeToConstant = useCallback(
    (reason: string) => {
      if (modeRef.current === 'follow') {
        setMode('constant')
        showToast(reason, 'warn')
      }
    },
    [showToast]
  )

  const asr = useAsr({
    presetId,
    micDeviceId: asrSettings?.micDeviceId ?? null,
    alignerRef,
    onOutput: applyOutput,
    onEngineError: (code, message) => {
      if (code === 'model-missing') setModelModal(true)
      else degradeToConstant(message ?? 'Speech engine unavailable — constant scroll')
    }
  })

  // ---- setup: spans, aligner, scroller ----
  useEffect(() => {
    if (!parsed || !textRef.current || !scrollerElRef.current) return
    spansRef.current = Array.from(textRef.current.querySelectorAll<HTMLElement>('.w'))
    prevTentativeRef.current = -1
    alignerRef.current = new ScriptAligner(parsed.index)

    // Seed the highlight on the first word before any speech arrives.
    const first = spansRef.current[0]
    if (first) {
      first.classList.add('current')
      setLineBar({ top: first.offsetTop - 4, height: first.offsetHeight + 8 })
    }

    const scroller = new PrompterScroller(scrollerElRef.current)
    scroller.onManual = () => setPausedPill(true)
    scroller.start()
    scrollerRef.current = scroller
    return () => {
      scroller.destroy()
      scrollerRef.current = null
    }
  }, [parsed])

  // ---- entry flow: model check → countdown → live ----
  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      if (!settings) return
      if (settings.scrollMode === 'manual') {
        setPhase('live')
        return
      }
      if (settings.scrollMode === 'constant') {
        setPhase('countdown')
        return
      }
      // follow mode: verify the model, then start engine+mic during countdown
      const status = await window.lp.asr.status(presetId)
      if (cancelled) return
      if (!status.cached) {
        setModelModal(true)
        return
      }
      setPhase('countdown')
      const ok = await asr.begin()
      if (!cancelled && !ok && asr.micError) {
        degradeToConstant(`${asr.micError.message} Falling back to constant scroll.`)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // mic errors surfacing after begin()
  useEffect(() => {
    if (asr.micError) degradeToConstant(`${asr.micError.message} Falling back to constant scroll.`)
  }, [asr.micError, degradeToConstant])

  // countdown ticker
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('live')
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // go live
  useEffect(() => {
    if (phase !== 'live') return
    if (mode === 'follow') asr.setLive(true)
    if (mode === 'constant') {
      const textEl = textRef.current
      const count = parsed?.index.displayCount ?? 0
      if (textEl && settings && count > 0) {
        const contentH = Math.max(1, textEl.scrollHeight - window.innerHeight * 0.9)
        const pxPerSec = (contentH / count) * (settings.constantWpm / 60)
        scrollerRef.current?.setConstantSpeed(pxPerSec)
      }
    } else {
      scrollerRef.current?.setConstantSpeed(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode])

  // ---- keyboard: space pause/resume, arrows manual-scroll ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') return // Shell handles exit
      const scroller = scrollerRef.current
      const el = scrollerElRef.current
      if (!scroller || !el) return
      if (e.key === ' ') {
        e.preventDefault()
        if (scroller.isFollowing) {
          scroller.manualInterrupt()
        } else {
          resume()
        }
        return
      }
      const lineStep = (settings?.fontSize ?? 56) * (settings?.lineHeight ?? 1.6)
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        scroller.manualInterrupt()
        el.scrollTop += e.key === 'PageDown' ? el.clientHeight * 0.8 : lineStep
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        scroller.manualInterrupt()
        el.scrollTop -= e.key === 'PageUp' ? el.clientHeight * 0.8 : lineStep
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  // ---- resume after manual override ----
  const resume = useCallback(() => {
    const scroller = scrollerRef.current
    const el = scrollerElRef.current
    const spans = spansRef.current
    if (!scroller || !el || spans.length === 0) {
      scrollerRef.current?.resumeFollowing()
      setPausedPill(false)
      return
    }
    // Re-seed the aligner at the word nearest the eye-line.
    const targetY = el.scrollTop + el.clientHeight * EYE_LINE
    let nearest = 0
    let bestDist = Infinity
    for (let i = 0; i < spans.length; i++) {
      const d = Math.abs(spans[i].offsetTop - targetY)
      if (d < bestDist) {
        bestDist = d
        nearest = i
      }
    }
    alignerRef.current?.resync(nearest)
    // refresh read/current classes around the new position
    for (let i = 0; i < spans.length; i++) {
      spans[i].classList.toggle('read', i < nearest)
      spans[i].classList.remove('current')
    }
    spans[nearest]?.classList.add('current')
    prevTentativeRef.current = nearest - 1
    setLineBar({ top: spans[nearest].offsetTop - 4, height: spans[nearest].offsetHeight + 8 })
    scroller.adoptCurrentPosition()
    scroller.resumeFollowing()
    setPausedPill(false)
  }, [])

  // ---- model download modal actions ----
  useEffect(() => {
    if (!modelModal) return
    return window.lp.asr.onModelProgress((p) => {
      setDlProgress(p)
      if (p.done) {
        setModelModal(false)
        setDlProgress(null)
        setPhase('countdown')
        setCountdown(3)
        asr.begin()
      } else if (p.error) {
        setDlProgress(null)
        showToast(p.error === 'cancelled' ? 'Download cancelled' : `Download failed: ${p.error}`, 'warn')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelModal])

  if (!script || !parsed || !settings) return null

  const font = fontById(settings.fontId)
  const preset = presetById(presetId)
  const statusLabel =
    mode !== 'follow'
      ? mode === 'constant'
        ? 'constant scroll'
        : 'manual'
      : phase !== 'live'
        ? 'warming up'
        : alignState === 'tracking'
          ? 'listening'
          : alignState === 'searching'
            ? 'searching…'
            : 'off script'

  return (
    <div className="prompter">
      <div className={`prompter-hud${pausedPill ? ' pinned' : ''}`}>
        <div className="hud-status">
          <span className={`status-dot ${mode === 'follow' && phase === 'live' ? alignState : ''}`} />
          <span>{statusLabel}</span>
        </div>
        {mode === 'follow' && (
          <div className="level-meter">
            {asr.levels.slice(-16).map((v, i) => (
              <span key={i} style={{ height: `${Math.max(8, v * 100)}%` }} />
            ))}
          </div>
        )}
        <div className="hud-spacer" />
        <span className="hud-hint">Space pause · ↑↓ scroll · Esc exit</span>
        <button className="icon-btn" onClick={exitPrompter} title="Exit (Esc)">
          <X size={16} />
        </button>
      </div>

      <div ref={scrollerElRef} className="prompter-scroll">
        <div
          ref={textRef}
          className={`prompter-text${settings.mirror ? ' mirrored' : ''}`}
          style={{
            fontFamily: font.cssFamily,
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight
          }}
        >
          {lineBar && <div className="line-bar" style={{ transform: `translateY(${lineBar.top}px)`, height: lineBar.height }} />}
          {parsed.blocks.map((block, bi) => {
            const spans = block.spans.map((s) => (
              <span key={s.display} className="w" data-idx={s.display}>
                {s.strong ? <strong>{s.text}</strong> : s.em ? <em>{s.text}</em> : s.text}{' '}
              </span>
            ))
            switch (block.type) {
              case 'h1':
                return <h1 key={bi}>{spans}</h1>
              case 'h2':
                return <h2 key={bi}>{spans}</h2>
              case 'h3':
                return <h3 key={bi}>{spans}</h3>
              case 'li':
                return <li key={bi}>{spans}</li>
              case 'blockquote':
                return <blockquote key={bi}>{spans}</blockquote>
              case 'code':
                return <pre key={bi}>{block.raw}</pre>
              case 'hr':
                return <div key={bi} className="hr" />
              default:
                return <p key={bi}>{spans}</p>
            }
          })}
        </div>
      </div>

      {pausedPill && (
        <button className="resume-pill" onClick={resume}>
          <Play size={14} />
          Resume from here
        </button>
      )}

      {phase === 'countdown' && countdown > 0 && <div className="countdown">{countdown}</div>}

      {modelModal && (
        <div className="prompter-modal">
          <div className="prompter-modal-card">
            <h3>Speech model needed</h3>
            <p>
              Voice-following needs a one-time download of the on-device speech model
              {preset ? ` (~${Math.round(presetTotalBytes(preset) / 1024 / 1024)} MB)` : ''}. After
              that, everything runs locally — nothing leaves your machine.
            </p>
            {dlProgress && !dlProgress.done ? (
              <>
                <div className="dl-bar">
                  <div
                    className="dl-bar-fill"
                    style={{ width: `${Math.round(dlProgress.progress * 100)}%` }}
                  />
                </div>
                <div className="prompter-modal-actions">
                  <button className="btn" onClick={() => window.lp.asr.cancelDownload(presetId)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="prompter-modal-actions">
                <button
                  className="btn"
                  onClick={() => {
                    setModelModal(false)
                    setMode('constant')
                    setPhase('countdown')
                  }}
                >
                  Use constant scroll
                </button>
                <button
                  className="btn accent"
                  onClick={() => {
                    setDlProgress({
                      presetId,
                      file: '',
                      loaded: 0,
                      total: 1,
                      progress: 0,
                      done: false
                    })
                    window.lp.asr.downloadModel(presetId)
                  }}
                >
                  Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
