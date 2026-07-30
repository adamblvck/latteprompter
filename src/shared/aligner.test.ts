import { describe, it, expect } from 'vitest'
import { ScriptAligner, boundedLevenshtein, wordMatch } from './aligner'
import { parseScript, normalizeHypothesis } from './script'
import type { AlignerOutput } from './aligner'

/** Feed a sequence of raw partial strings as one utterance, final at the end. */
function speak(
  aligner: ScriptAligner,
  utteranceId: number,
  partials: string[],
  final = true
): AlignerOutput {
  let out!: AlignerOutput
  partials.forEach((text, i) => {
    const isFinal = final && i === partials.length - 1
    out = aligner.feed({ utteranceId, words: normalizeHypothesis(text), isFinal })
  })
  return out
}

/** Incremental prefixes of a sentence: "a b c" → ["a", "a b", "a b c"]. */
function grow(text: string): string[] {
  const words = text.split(/\s+/)
  return words.map((_, i) => words.slice(0, i + 1).join(' '))
}

const SCRIPT = `Good evening everyone and welcome to the show.
Tonight we are going to talk about the future of technology.
Artificial intelligence is changing everything we know.
The next decade will bring changes nobody can predict.
Thank you all for being here with us tonight.`

function makeAligner(cfg = {}) {
  const { index } = parseScript(SCRIPT)
  return { aligner: new ScriptAligner(index, cfg), index }
}

describe('boundedLevenshtein', () => {
  it('computes small distances and respects the bound', () => {
    expect(boundedLevenshtein('there', 'their', 2)).toBe(2)
    expect(boundedLevenshtein('hello', 'hello', 1)).toBe(0)
    expect(boundedLevenshtein('abcdef', 'zzzzzz', 2)).toBe(3) // bound+1
  })
})

describe('wordMatch', () => {
  it('matches exact and alts', () => {
    expect(wordMatch('hello', { norm: 'hello', display: 0 }, false)).toBe(2)
    expect(wordMatch('okay', { norm: 'ok', alts: ['okay'], display: 0 }, false)).toBe(2)
  })
  it('fuzzy-matches near misses on longer words', () => {
    expect(wordMatch('evenin', { norm: 'evening', display: 0 }, false)).toBe(1)
    expect(wordMatch('cat', { norm: 'car', display: 0 }, false)).toBe(0) // too short for fuzz
  })
  it('prefix-matches only at the tip', () => {
    expect(wordMatch('technol', { norm: 'technology', display: 0 }, true)).toBe(1)
    expect(wordMatch('technol', { norm: 'technology', display: 0 }, false)).toBe(0)
  })
})

describe('ScriptAligner', () => {
  it('1. tracks a verbatim read, committing monotonically', () => {
    const { aligner } = makeAligner()
    const outputs: AlignerOutput[] = []
    let prevCommitted = -1
    for (const partial of grow('good evening everyone and welcome to the show')) {
      const out = aligner.feed({ utteranceId: 0, words: normalizeHypothesis(partial), isFinal: false })
      expect(out.committedDisplay).toBeGreaterThanOrEqual(prevCommitted)
      prevCommitted = out.committedDisplay
      outputs.push(out)
    }
    const final = aligner.feed({
      utteranceId: 0,
      words: normalizeHypothesis('good evening everyone and welcome to the show'),
      isFinal: true
    })
    expect(final.state).toBe('tracking')
    expect(final.confidence).toBeGreaterThan(0.9)
    // "show." is display index 7 in the first sentence
    expect(final.tentativeDisplay).toBe(7)
    expect(final.committedDisplay).toBe(7)
  })

  it('2. survives partial-tail mutation without regressing committed', () => {
    const { aligner } = makeAligner()
    const feeds = [
      'good evening',
      'good evening every',
      'good evening everyone and',
      'good evening everybody and welcome' // ASR revised "everyone"→"everybody" (fuzzy)
    ]
    let prevCommitted = -1
    let out!: AlignerOutput
    for (const f of feeds) {
      out = aligner.feed({ utteranceId: 0, words: normalizeHypothesis(f), isFinal: false })
      expect(out.committedDisplay).toBeGreaterThanOrEqual(prevCommitted)
      prevCommitted = out.committedDisplay
    }
    expect(out.tentativeDisplay).toBe(4) // "welcome"
    expect(out.state).toBe('tracking')
  })

  it('3. skips ad-lib insertions and resumes on script words', () => {
    const { aligner } = makeAligner()
    const out = speak(aligner, 0, grow('good evening uh you know everyone and welcome'))
    expect(out.tentativeDisplay).toBe(4) // "welcome"
    expect(out.state).toBe('tracking')
    expect(out.confidence).toBeLessThan(1)
    expect(out.confidence).toBeGreaterThan(0.5)
  })

  it('4. re-anchors forward when the speaker skips a sentence', () => {
    const { aligner } = makeAligner()
    speak(aligner, 0, grow('good evening everyone and welcome to the show'))
    // Skip sentence 2 entirely, jump to sentence 3.
    const out = speak(aligner, 1, grow('artificial intelligence is changing everything we know'))
    // "know." ends sentence 3; find its display index dynamically.
    const { blocks } = parseScript(SCRIPT)
    const spans = blocks.flatMap((b) => b.spans)
    const knowIdx = spans.findIndex((s) => s.text === 'know.')
    expect(out.tentativeDisplay).toBe(knowIdx)
    expect(out.state).toBe('tracking')
  })

  it('5. jumps backward only via a confirmed re-anchor', () => {
    const { aligner } = makeAligner()
    speak(aligner, 0, grow('good evening everyone and welcome to the show'))
    speak(aligner, 1, grow('tonight we are going to talk about the future of technology'))
    const afterForward = speak(
      aligner,
      2,
      grow('artificial intelligence is changing everything we know'),
      false
    )
    // Speaker restarts sentence 2 from the top.
    const out = speak(aligner, 3, grow('tonight we are going to talk about the future'))
    expect(out.tentativeDisplay).toBeLessThan(afterForward.tentativeDisplay)
    const { blocks } = parseScript(SCRIPT)
    const spans = blocks.flatMap((b) => b.spans)
    const futureIdx = spans.findIndex((s) => s.text === 'future')
    expect(out.tentativeDisplay).toBe(futureIdx)
  })

  it('6. matches fuzzy variants and alt forms', () => {
    const { index } = parseScript('The colour of the theatre is OK tonight')
    const aligner = new ScriptAligner(index)
    const out = speak(aligner, 0, grow('the color of the theater is okay tonight'))
    expect(out.state).toBe('tracking')
    expect(out.confidence).toBeGreaterThan(0.9)
  })

  it('7. tracks through expanded numbers', () => {
    const { index, blocks } = (() => {
      const parsed = parseScript('In 1984 we sold 42 units to customers')
      return { index: parsed.index, blocks: parsed.blocks }
    })()
    const aligner = new ScriptAligner(index)
    const out = speak(aligner, 0, grow('in nineteen eighty four we sold forty two units'))
    const spans = blocks.flatMap((b) => b.spans)
    const unitsIdx = spans.findIndex((s) => s.text === 'units')
    expect(out.tentativeDisplay).toBe(unitsIdx)
    expect(out.state).toBe('tracking')
  })

  it('8. holds position across an utterance boundary (pause)', () => {
    const { aligner } = makeAligner()
    const beforePause = speak(aligner, 0, grow('good evening everyone and welcome to the show'))
    // silence — no feeds — then a new utterance resumes mid-script
    const out = speak(aligner, 1, grow('tonight we are going'))
    expect(out.tentativeDisplay).toBeGreaterThan(beforePause.tentativeDisplay)
    expect(out.state).toBe('tracking')
  })

  it('9. goes searching then lost off-script, recovers on return', () => {
    const { aligner } = makeAligner()
    speak(aligner, 0, grow('good evening everyone and welcome to the show'))
    const held = speak(
      aligner,
      1,
      grow('completely unrelated rambling about sandwiches pizza burgers fries milkshakes ketchup mustard onions pickles'),
      false
    )
    expect(['searching', 'lost']).toContain(held.state)
    const anchor = speak(aligner, 1, [
      'completely unrelated rambling about sandwiches pizza burgers fries milkshakes ketchup mustard onions pickles tonight we are going to talk'
    ])
    expect(anchor.state).toBe('tracking')
    const { blocks } = parseScript(SCRIPT)
    const spans = blocks.flatMap((b) => b.spans)
    expect(anchor.tentativeDisplay).toBe(spans.findIndex((s) => s.text === 'talk'))
  })

  it('10. prefers the nearest occurrence of a repeated phrase', () => {
    const phrase = 'and now we begin the show'
    const script = `${phrase} with music. Later tonight more things happen here. ${phrase} once again my friends.`
    const { index } = parseScript(script)
    const aligner = new ScriptAligner(index)
    const out = speak(aligner, 0, grow('and now we begin the show'))
    // Should track the FIRST occurrence (nearest to start), not the second.
    expect(out.tentativeDisplay).toBeLessThan(10)
  })

  it('resync re-seeds position for manual override', () => {
    const { aligner, index } = makeAligner()
    speak(aligner, 0, grow('good evening everyone and welcome to the show'))
    // User scrolls to the last sentence; find "thank" display.
    const { blocks } = parseScript(SCRIPT)
    const spans = blocks.flatMap((b) => b.spans)
    const thankIdx = spans.findIndex((s) => s.text === 'Thank')
    aligner.resync(thankIdx)
    const out = speak(aligner, 1, grow('thank you all for being here'))
    expect(out.state).toBe('tracking')
    expect(out.tentativeDisplay).toBe(spans.findIndex((s) => s.text === 'here'))
    expect(index.words.length).toBeGreaterThan(0)
  })

  it('handles an empty script without errors', () => {
    const { index } = parseScript('')
    const aligner = new ScriptAligner(index)
    const out = aligner.feed({ utteranceId: 0, words: ['hello'], isFinal: true })
    expect(out.committedDisplay).toBe(-1)
    expect(out.state).toBe('tracking')
  })
})
