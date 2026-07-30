import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeHypothesis } from '@shared/script'
import type { ScriptAligner, AlignerOutput } from '@shared/aligner'
import type { AsrEngineState } from '@shared/ipc'
import { DEFAULT_PRESET_ID } from '@shared/asr-models'
import { startMic, MicError, type MicSession } from '@renderer/lib/mic'

export interface UseAsrResult {
  engineState: AsrEngineState
  /** Rolling mic level bars, newest last (0..1). */
  levels: number[]
  micError: MicError | null
  /** Begin capture + recognition. Resolves false when it can't start. */
  begin: () => Promise<boolean>
  end: () => void
  /** Gate: aligner is only fed while live (post-countdown). */
  setLive: (live: boolean) => void
}

const LEVEL_BARS = 24

/**
 * Wires mic capture → ASR engine → aligner. The aligner instance is owned by
 * the prompter (it is rebuilt per script); outputs flow through onOutput.
 */
export function useAsr(opts: {
  presetId: string | null
  micDeviceId: string | null
  alignerRef: React.MutableRefObject<ScriptAligner | null>
  onOutput: (out: AlignerOutput) => void
  onEngineError: (code: string | undefined, message: string | undefined) => void
}): UseAsrResult {
  const [engineState, setEngineState] = useState<AsrEngineState>('idle')
  const [levels, setLevels] = useState<number[]>(() => new Array(LEVEL_BARS).fill(0))
  const [micError, setMicError] = useState<MicError | null>(null)

  const micRef = useRef<MicSession | null>(null)
  const liveRef = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const unsubPartial = window.lp.asr.onPartial((p) => {
      if (!liveRef.current) return
      const aligner = optsRef.current.alignerRef.current
      if (!aligner) return
      const words = normalizeHypothesis(p.text)
      if (words.length === 0) return
      const out = aligner.feed({ utteranceId: p.utteranceId, words, isFinal: p.isFinal })
      optsRef.current.onOutput(out)
    })
    const unsubState = window.lp.asr.onState((s) => {
      setEngineState(s.state)
      if (s.state === 'error') optsRef.current.onEngineError(s.code, s.message)
    })
    return () => {
      unsubPartial()
      unsubState()
    }
  }, [])

  const end = useCallback(() => {
    micRef.current?.stop()
    micRef.current = null
    liveRef.current = false
  }, [])

  const begin = useCallback(async (): Promise<boolean> => {
    setMicError(null)
    const { granted } = await window.lp.media.requestMicAccess()
    if (!granted) {
      setMicError(new MicError('Microphone access was denied.', 'denied'))
      return false
    }
    const presetId = optsRef.current.presetId ?? DEFAULT_PRESET_ID
    const { cached } = await window.lp.asr.start(presetId)
    if (!cached) return false

    try {
      micRef.current = await startMic({
        deviceId: optsRef.current.micDeviceId,
        onLevel: (rms) =>
          setLevels((prev) => {
            const next = prev.slice(1)
            next.push(rms)
            return next
          }),
        onPcm: (pcm, sampleRate) => {
          window.lp.asr.feed(pcm.buffer as ArrayBuffer, sampleRate)
        }
      })
      return true
    } catch (err) {
      setMicError(err instanceof MicError ? err : new MicError(String(err), 'unknown'))
      return false
    }
  }, [])

  const setLive = useCallback((live: boolean) => {
    liveRef.current = live
  }, [])

  useEffect(() => end, [end])

  return { engineState, levels, micError, begin, end, setLive }
}
