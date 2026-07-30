import { describe, it, expect } from 'vitest'
import { integerWords, yearWords, ordinalWords, expandNumberToken } from './numwords'

describe('integerWords', () => {
  it('handles 0–19', () => {
    expect(integerWords(0)).toEqual(['zero'])
    expect(integerWords(7)).toEqual(['seven'])
    expect(integerWords(13)).toEqual(['thirteen'])
  })
  it('handles tens', () => {
    expect(integerWords(42)).toEqual(['forty', 'two'])
    expect(integerWords(90)).toEqual(['ninety'])
  })
  it('handles hundreds and thousands', () => {
    expect(integerWords(105)).toEqual(['one', 'hundred', 'and', 'five'])
    expect(integerWords(1250)).toEqual(['one', 'thousand', 'two', 'hundred', 'and', 'fifty'])
  })
})

describe('yearWords', () => {
  it('reads 1984 as nineteen eighty four', () => {
    expect(yearWords(1984)).toEqual(['nineteen', 'eighty', 'four'])
  })
  it('reads 2007 as two thousand seven', () => {
    expect(yearWords(2007)).toEqual(['two', 'thousand', 'seven'])
  })
  it('reads 1900 as nineteen hundred', () => {
    expect(yearWords(1900)).toEqual(['nineteen', 'hundred'])
  })
  it('reads 2023 as twenty twenty three', () => {
    expect(yearWords(2023)).toEqual(['twenty', 'twenty', 'three'])
  })
})

describe('ordinalWords', () => {
  it('handles simple ordinals', () => {
    expect(ordinalWords(1)).toEqual(['first'])
    expect(ordinalWords(3)).toEqual(['third'])
    expect(ordinalWords(12)).toEqual(['twelfth'])
  })
  it('handles compound ordinals', () => {
    expect(ordinalWords(21)).toEqual(['twenty', 'first'])
    expect(ordinalWords(40)).toEqual(['fortieth'])
  })
})

describe('expandNumberToken', () => {
  it('returns null for non-numbers', () => {
    expect(expandNumberToken('hello')).toBeNull()
    expect(expandNumberToken('a1b')).toBeNull()
  })
  it('expands plain integers', () => {
    expect(expandNumberToken('42')!.words).toEqual(['forty', 'two'])
  })
  it('expands years with the year reading primary', () => {
    const e = expandNumberToken('1984')!
    expect(e.words).toEqual(['nineteen', 'eighty', 'four'])
    expect(e.alts.length).toBeGreaterThan(0)
  })
  it('expands percent and dollars', () => {
    expect(expandNumberToken('75%')!.words).toEqual(['seventy', 'five', 'percent'])
    expect(expandNumberToken('$40')!.words).toEqual(['forty', 'dollars'])
  })
  it('expands ordinals', () => {
    expect(expandNumberToken('3rd')!.words).toEqual(['third'])
    expect(expandNumberToken('21st')!.words).toEqual(['twenty', 'first'])
  })
  it('expands decimals with point', () => {
    expect(expandNumberToken('3.14')!.words).toEqual(['three', 'point', 'one', 'four'])
  })
  it('spells out huge numbers as digits', () => {
    expect(expandNumberToken('123456')!.words).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
  })
})
