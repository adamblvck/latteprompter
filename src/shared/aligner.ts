/**
 * ScriptAligner — matches live streaming-ASR partial hypotheses against a
 * preprocessed script and tracks the speaker's position.
 *
 * Deterministic and pure: no timers, no globals. Silence = no feed calls =
 * position holds by construction. Partial instability is handled with
 * stable-prefix checkpointing: each feed rolls back to the longest common
 * prefix with the previous partial and reprocesses only the changed tail.
 */
import type { MatchWord, ScriptIndex } from './script'

export interface AlignerConfig {
  /** Tier-1 local window behind/ahead of the expected position (script words). */
  lookbehind: number
  lookahead: number
  /** Max acceptable Tier-1 cost (distance penalty + match-quality penalty). */
  maxTier1Cost: number
  /** Consecutive unmatched hypothesis words before Tier-2 re-anchoring kicks in. */
  missStreakForAnchor: number
  /** Hypothesis tail length used for Tier-2 anchoring. */
  anchorTail: number
  /** Tier-2 search span behind/ahead of the expected position. */
  anchorBack: number
  anchorAhead: number
  /** Min in-order anchor score (exact=2, fuzzy=1) to accept a Tier-2 jump. */
  anchorMinScore: number
  /** Trailing hypothesis words considered unstable (may still mutate). */
  unstableTail: number
  /** Miss streak beyond which state degrades from 'searching' to 'lost'. */
  lostThreshold: number
  /** Rolling window (hypothesis words) for the confidence ratio. */
  confidenceWindow: number
}

export const DEFAULT_ALIGNER_CONFIG: AlignerConfig = {
  lookbehind: 8,
  lookahead: 40,
  maxTier1Cost: 1.2,
  missStreakForAnchor: 3,
  anchorTail: 4,
  anchorBack: 25,
  anchorAhead: 150,
  anchorMinScore: 6,
  unstableTail: 2,
  lostThreshold: 10,
  confidenceWindow: 10
}

export type AlignerState = 'tracking' | 'searching' | 'lost'

export interface AlignerOutput {
  /** Display index the speaker has definitely passed (-1 = not started). */
  committedDisplay: number
  /** Best current guess — drives highlight + scroll (-1 = not started). */
  tentativeDisplay: number
  /** 0..1 rolling match ratio. */
  confidence: number
  state: AlignerState
}

export interface AlignerFeed {
  utteranceId: number
  /** Full normalized hypothesis of the current utterance so far. */
  words: string[]
  isFinal: boolean
}

/** Bounded Levenshtein with early exit. Returns maxDist+1 when exceeded. */
export function boundedLevenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1
  const m = a.length
  const n = b.length
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > maxDist) return maxDist + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/** 0 = no match, 1 = fuzzy/prefix, 2 = exact. */
export function wordMatch(hyp: string, script: MatchWord, isTip: boolean): 0 | 1 | 2 {
  if (hyp === script.norm) return 2
  if (script.alts && script.alts.includes(hyp)) return 2
  const maxLen = Math.max(hyp.length, script.norm.length)
  if (maxLen >= 4) {
    const allowed = maxLen >= 8 ? 2 : 1
    if (boundedLevenshtein(hyp, script.norm, allowed) <= allowed) return 1
  }
  // The word currently being spoken is often truncated ("beauti" → "beautiful").
  if (isTip && hyp.length >= 3 && script.norm.startsWith(hyp)) return 1
  return 0
}

type HistoryEvent = 1 | 0 // match | miss

interface Checkpoint {
  pos: number
  missStreak: number
  history: HistoryEvent[]
  lastMatchedWord: number
}

export class ScriptAligner {
  private readonly words: MatchWord[]
  private readonly cfg: AlignerConfig

  /** Next expected script word index. */
  private pos = 0
  private missStreak = 0
  private history: HistoryEvent[] = []
  /** Script word index of the newest matched hypothesis word (-1 = none). */
  private lastMatchedWord = -1
  /** Monotonic-except-confirmed-backward committed script word index. */
  private committedWord = -1
  private backwardStreak = 0

  private utteranceId = -1
  private prevWords: string[] = []
  /** hypMatches[i] = script word index matched by hypothesis word i, or null. */
  private hypMatches: (number | null)[] = []
  /** checkpoints[k] = state after consuming k hypothesis words. */
  private checkpoints: Checkpoint[] = []

  constructor(index: ScriptIndex, cfg: Partial<AlignerConfig> = {}) {
    this.words = index.words
    this.cfg = { ...DEFAULT_ALIGNER_CONFIG, ...cfg }
    this.checkpoints = [this.snapshot()]
  }

  /** Re-seed the position after a manual scroll (displayIdx = word span index). */
  resync(displayIdx: number): void {
    let w = this.words.findIndex((mw) => mw.display >= displayIdx)
    if (w < 0) w = this.words.length
    this.pos = w
    this.missStreak = 0
    this.history = []
    this.lastMatchedWord = w - 1
    this.committedWord = w - 1
    this.backwardStreak = 0
    this.prevWords = []
    this.hypMatches = []
    this.checkpoints = [this.snapshot()]
  }

  feed(p: AlignerFeed): AlignerOutput {
    if (this.words.length === 0) {
      return { committedDisplay: -1, tentativeDisplay: -1, confidence: 1, state: 'tracking' }
    }

    if (p.utteranceId !== this.utteranceId) {
      // New utterance: previous one is settled; keep position, reset partial state.
      this.utteranceId = p.utteranceId
      this.prevWords = []
      this.hypMatches = []
      this.checkpoints = [this.snapshot()]
    }

    // Roll back to the longest common prefix with the previous partial.
    let lcp = 0
    while (
      lcp < this.prevWords.length &&
      lcp < p.words.length &&
      this.prevWords[lcp] === p.words[lcp]
    ) {
      lcp++
    }
    this.restore(this.checkpoints[lcp])
    this.checkpoints.length = lcp + 1
    this.hypMatches.length = lcp

    for (let i = lcp; i < p.words.length; i++) {
      const isTip = i === p.words.length - 1 && !p.isFinal
      this.consume(p.words[i], i, p.words, isTip)
      this.checkpoints.push(this.snapshot())
    }
    this.prevWords = p.words.slice()

    // Committed position: newest match among stable hypothesis words.
    const stableEnd = p.isFinal ? p.words.length - 1 : p.words.length - 1 - this.cfg.unstableTail
    let stableMatch: number | null = null
    for (let i = Math.min(stableEnd, this.hypMatches.length - 1); i >= 0; i--) {
      if (this.hypMatches[i] !== null) {
        stableMatch = this.hypMatches[i]
        break
      }
    }
    if (stableMatch !== null) {
      if (stableMatch >= this.committedWord) {
        this.committedWord = stableMatch
        this.backwardStreak = 0
      } else {
        // Backward movement commits only when confirmed (final, or twice in a row).
        this.backwardStreak++
        if (p.isFinal || this.backwardStreak >= 2) {
          this.committedWord = stableMatch
          this.backwardStreak = 0
        }
      }
    }

    return this.output()
  }

  private output(): AlignerOutput {
    const matches = this.history.reduce<number>((s, e) => s + e, 0)
    const confidence = this.history.length === 0 ? 1 : matches / this.history.length
    const state: AlignerState =
      this.missStreak > this.cfg.lostThreshold
        ? 'lost'
        : this.missStreak >= this.cfg.missStreakForAnchor
          ? 'searching'
          : 'tracking'
    return {
      committedDisplay: this.committedWord >= 0 ? this.words[this.committedWord].display : -1,
      tentativeDisplay: this.lastMatchedWord >= 0 ? this.words[this.lastMatchedWord].display : -1,
      confidence,
      state
    }
  }

  private snapshot(): Checkpoint {
    return {
      pos: this.pos,
      missStreak: this.missStreak,
      history: this.history.slice(),
      lastMatchedWord: this.lastMatchedWord
    }
  }

  private restore(c: Checkpoint): void {
    this.pos = c.pos
    this.missStreak = c.missStreak
    this.history = c.history.slice()
    this.lastMatchedWord = c.lastMatchedWord
  }

  private pushHistory(e: HistoryEvent): void {
    this.history.push(e)
    if (this.history.length > this.cfg.confidenceWindow) this.history.shift()
  }

  private consume(hyp: string, hypIdx: number, allWords: string[], isTip: boolean): void {
    const cfg = this.cfg
    const n = this.words.length

    // Tier 1: greedy match in a local window around the expected position.
    const lo = Math.max(0, this.pos - cfg.lookbehind)
    const hi = Math.min(n - 1, this.pos + cfg.lookahead)
    let bestJ = -1
    let bestCost = Infinity
    for (let j = lo; j <= hi; j++) {
      const m = wordMatch(hyp, this.words[j], isTip)
      if (m === 0) continue
      const d = j - this.pos
      let dist: number
      if (d === 0) dist = 0
      else if (d > 0) dist = d <= 3 ? 0.15 * d : 0.45 + 0.6 * (d - 3)
      else dist = 1.0 * -d
      const cost = dist + (m === 2 ? 0 : 0.5)
      if (cost < bestCost) {
        bestCost = cost
        bestJ = j
      }
    }
    if (bestJ >= 0 && bestCost <= cfg.maxTier1Cost) {
      this.hypMatches[hypIdx] = bestJ
      this.pos = bestJ + 1
      this.lastMatchedWord = bestJ
      this.missStreak = 0
      this.pushHistory(1)
      return
    }

    // Insertion (ad-lib) — no local match.
    this.hypMatches[hypIdx] = null
    this.missStreak++
    this.pushHistory(0)

    // Tier 2: re-anchor on the hypothesis tail once we've drifted.
    if (this.missStreak < cfg.missStreakForAnchor) return
    const tailStart = Math.max(0, hypIdx + 1 - cfg.anchorTail)
    const tail = allWords.slice(tailStart, hypIdx + 1)
    const anchor = this.findAnchor(tail)
    if (!anchor) return

    // Retroactively assign tail matches so committed follows once they stabilize.
    for (let t = 0; t < tail.length; t++) {
      const j = anchor.matched[t]
      if (j !== null) this.hypMatches[tailStart + t] = j
    }
    this.pos = anchor.endPos
    this.lastMatchedWord = anchor.lastMatched
    this.missStreak = 0
    this.pushHistory(1)
  }

  /**
   * Slide the hypothesis tail over the anchor window scoring in-order matches
   * (exact=2, fuzzy=1, ≤1 script-word gap between consecutive matches).
   */
  private findAnchor(
    tail: string[]
  ): { endPos: number; lastMatched: number; matched: (number | null)[] } | null {
    const cfg = this.cfg
    const n = this.words.length
    const lo = Math.max(0, this.pos - cfg.anchorBack)
    const hi = Math.min(n - 1, this.pos + cfg.anchorAhead)
    let best: { score: number; dist: number; endPos: number; lastMatched: number; matched: (number | null)[] } | null =
      null

    for (let s = lo; s <= hi; s++) {
      let k = s
      let score = 0
      let lastMatched = -1
      const matched: (number | null)[] = []
      for (const w of tail) {
        let found: number | null = null
        let quality: 0 | 1 | 2 = 0
        const limit = Math.min(k + 2, n - 1)
        for (let j = k; j <= limit; j++) {
          const m = wordMatch(w, this.words[j], false)
          if (m > 0) {
            found = j
            quality = m
            break
          }
        }
        if (found !== null) {
          score += quality
          k = found + 1
          lastMatched = found
        }
        matched.push(found)
      }
      if (score < cfg.anchorMinScore || lastMatched < 0) continue
      const dist = Math.abs(s - this.pos)
      if (!best || score > best.score || (score === best.score && dist < best.dist)) {
        best = { score, dist, endPos: lastMatched + 1, lastMatched, matched }
      }
    }
    return best ? { endPos: best.endPos, lastMatched: best.lastMatched, matched: best.matched } : null
  }
}
