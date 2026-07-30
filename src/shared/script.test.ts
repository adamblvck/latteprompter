import { describe, it, expect } from 'vitest'
import { parseScript, normalizeWord, normalizeHypothesis } from './script'

describe('normalizeWord', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeWord('Hello,')).toBe('hello')
    expect(normalizeWord('world!')).toBe('world')
  })
  it('drops apostrophes', () => {
    expect(normalizeWord("don't")).toBe('dont')
    expect(normalizeWord('it’s')).toBe('its')
  })
  it('strips diacritics', () => {
    expect(normalizeWord('café')).toBe('cafe')
  })
  it('returns empty for pure punctuation', () => {
    expect(normalizeWord('—')).toBe('')
  })
})

describe('normalizeHypothesis', () => {
  it('splits and normalizes, dropping empties', () => {
    expect(normalizeHypothesis('Hello,  world — YES')).toEqual(['hello', 'world', 'yes'])
  })

  it('expands digit tokens to spoken words (Parakeet emits numerals)', () => {
    expect(normalizeHypothesis('in 1984 we sold 42 units.')).toEqual([
      'in',
      'nineteen',
      'eighty',
      'four',
      'we',
      'sold',
      'forty',
      'two',
      'units'
    ])
  })
})

describe('parseScript', () => {
  it('parses paragraphs into word spans with sequential display indices', () => {
    const { blocks, index } = parseScript('Hello brave new world.')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('p')
    expect(blocks[0].spans.map((s) => s.text)).toEqual(['Hello', 'brave', 'new', 'world.'])
    expect(blocks[0].spans.map((s) => s.display)).toEqual([0, 1, 2, 3])
    expect(index.displayCount).toBe(4)
    expect(index.words.map((w) => w.norm)).toEqual(['hello', 'brave', 'new', 'world'])
  })

  it('maps headings and lists to spoken words', () => {
    const { blocks, index } = parseScript('# Title Here\n\n- item one\n- item two')
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'li', 'li'])
    expect(index.words.map((w) => w.norm)).toEqual(['title', 'here', 'item', 'one', 'item', 'two'])
  })

  it('renders code blocks but produces no match words for them', () => {
    const { blocks, index } = parseScript('Say this\n\n```\nnot spoken\n```\n\nAnd this')
    expect(blocks.map((b) => b.type)).toEqual(['p', 'code', 'p'])
    expect(index.words.map((w) => w.norm)).toEqual(['say', 'this', 'and', 'this'])
  })

  it('splits hyphenated words into multiple match words on one span', () => {
    const { blocks, index } = parseScript('state-of-the-art tools')
    expect(blocks[0].spans).toHaveLength(2)
    const parts = index.words.filter((w) => w.display === 0)
    expect(parts.map((w) => w.norm)).toEqual(['state', 'of', 'the', 'art'])
  })

  it('expands numbers into spoken sequences on one span', () => {
    const { blocks, index } = parseScript('In 1984 we sold 42 units')
    expect(blocks[0].spans.map((s) => s.text)).toEqual(['In', '1984', 'we', 'sold', '42', 'units'])
    const year = index.words.filter((w) => w.display === 1)
    expect(year.map((w) => w.norm)).toEqual(['nineteen', 'eighty', 'four'])
    const qty = index.words.filter((w) => w.display === 4)
    expect(qty.map((w) => w.norm)).toEqual(['forty', 'two'])
  })

  it('keeps bold/italic markers on spans and matches through links', () => {
    const { blocks, index } = parseScript('This is **very** important, see [the docs](https://x.dev).')
    const strongSpan = blocks[0].spans.find((s) => s.strong)
    expect(strongSpan?.text).toBe('very')
    expect(index.words.map((w) => w.norm)).toContain('docs')
  })

  it('gives punctuation-only spans no match words but keeps display continuity', () => {
    const { blocks, index } = parseScript('Wait — go')
    expect(blocks[0].spans).toHaveLength(3)
    expect(index.words.map((w) => w.norm)).toEqual(['wait', 'go'])
    expect(index.words[1].display).toBe(2)
  })

  it('handles blockquotes and hr', () => {
    const { blocks, index } = parseScript('> quoted words\n\n---\n\nafter')
    expect(blocks.map((b) => b.type)).toEqual(['blockquote', 'hr', 'p'])
    expect(index.words.map((w) => w.norm)).toEqual(['quoted', 'words', 'after'])
  })

  it('parses an empty script safely', () => {
    const { blocks, index } = parseScript('')
    expect(blocks).toHaveLength(0)
    expect(index.words).toHaveLength(0)
  })
})
