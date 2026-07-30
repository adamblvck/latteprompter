/**
 * Numeral → spoken-word expansion. The streaming zipformer model emits number
 * *words* ("nineteen eighty four"), never digits, so scripts containing figures
 * need their numerals expanded into the word sequences a recognizer will produce.
 * Pure functions, no dependencies.
 */

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
]

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

const ORDINAL_ONES: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
  13: 'thirteenth',
  14: 'fourteenth',
  15: 'fifteenth',
  16: 'sixteenth',
  17: 'seventeenth',
  18: 'eighteenth',
  19: 'nineteenth',
  20: 'twentieth',
  30: 'thirtieth'
}

/** 0–99 as words: 42 → ['forty', 'two'] */
function tensWords(n: number): string[] {
  if (n < 20) return [ONES[n]]
  const t = Math.floor(n / 10)
  const o = n % 10
  return o === 0 ? [TENS[t]] : [TENS[t], ONES[o]]
}

/** Integer 0–9999 as words: 1250 → ['one','thousand','two','hundred','fifty'] */
export function integerWords(n: number): string[] {
  if (n < 0 || n > 9999 || !Number.isInteger(n)) return [String(n)]
  if (n < 100) return tensWords(n)
  const out: string[] = []
  const th = Math.floor(n / 1000)
  const h = Math.floor((n % 1000) / 100)
  const rest = n % 100
  if (th > 0) out.push(ONES[th], 'thousand')
  if (h > 0) out.push(ONES[h], 'hundred')
  if (rest > 0) {
    if (out.length > 0) out.push('and')
    out.push(...tensWords(rest))
  }
  return out
}

/** Year-style reading: 1984 → ['nineteen','eighty','four'], 2007 → ['two','thousand','seven'] */
export function yearWords(n: number): string[] {
  if (n < 1000 || n > 2999) return integerWords(n)
  const hi = Math.floor(n / 100)
  const lo = n % 100
  if (hi % 10 === 0) {
    if (lo === 0) return [...tensWords(hi / 10), 'thousand']
    // 2007-style: "two thousand seven"; 2023-style: "twenty twenty three"
    if (lo < 10) return [...tensWords(hi / 10), 'thousand', ...tensWords(lo)]
    return [...tensWords(hi), ...tensWords(lo)]
  }
  if (lo === 0) return [...tensWords(hi), 'hundred']
  if (lo < 10) return [...tensWords(hi), 'oh', ONES[lo]]
  return [...tensWords(hi), ...tensWords(lo)]
}

export function ordinalWords(n: number): string[] {
  if (ORDINAL_ONES[n]) return [ORDINAL_ONES[n]]
  if (n < 100) {
    const t = Math.floor(n / 10) * 10
    const o = n % 10
    if (o === 0) {
      const base = TENS[t / 10]
      return [base.replace(/y$/, 'ieth')]
    }
    return [TENS[t / 10], ORDINAL_ONES[o]]
  }
  return integerWords(n)
}

export interface NumExpansion {
  /** primary spoken sequence */
  words: string[]
  /** alternate spoken sequences that should also match */
  alts: string[][]
}

/**
 * Expand a raw script token that contains digits into its spoken forms.
 * Returns null when the token isn't a number form we understand — the caller
 * falls back to treating it as a literal word.
 */
export function expandNumberToken(raw: string): NumExpansion | null {
  let t = raw.trim()
  let suffix: string[] = []

  if (/^\$[\d,]+(\.\d+)?$/.test(t)) {
    t = t.slice(1)
    suffix = ['dollars']
  } else if (/^[\d,]+%$/.test(t)) {
    t = t.slice(0, -1)
    suffix = ['percent']
  }

  // ordinals: 1st, 22nd, 3rd, 15th
  const ord = t.match(/^(\d+)(st|nd|rd|th)$/i)
  if (ord) {
    const n = parseInt(ord[1], 10)
    if (n >= 1 && n <= 99) return { words: ordinalWords(n), alts: [] }
  }

  t = t.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null

  if (t.includes('.')) {
    const [int, frac] = t.split('.')
    const words = [
      ...integerWords(parseInt(int, 10)),
      'point',
      ...frac.split('').map((d) => ONES[parseInt(d, 10)])
    ]
    return { words: [...words, ...suffix], alts: [] }
  }

  const n = parseInt(t, 10)
  if (n > 9999) {
    // Too big to expand confidently — spell digits as a fallback.
    return { words: [...t.split('').map((d) => ONES[parseInt(d, 10)]), ...suffix], alts: [] }
  }

  const primary = [...integerWords(n), ...suffix]
  const alts: string[][] = []
  // Years read both ways: "nineteen eighty four" and "one thousand nine hundred..."
  if (n >= 1000 && n <= 2999) {
    const year = [...yearWords(n), ...suffix]
    if (year.join(' ') !== primary.join(' ')) alts.push(primary)
    return { words: year, alts }
  }
  // "hundred and five" vs "hundred five": accept both by stripping 'and' in an alt
  if (primary.includes('and')) alts.push(primary.filter((w) => w !== 'and'))
  return { words: primary, alts }
}

/** Common spoken/written equivalences beyond numbers. */
export const WORD_ALTS: Record<string, string[]> = {
  ok: ['okay'],
  okay: ['ok'],
  mr: ['mister'],
  mrs: ['missus'],
  dr: ['doctor'],
  st: ['saint', 'street'],
  vs: ['versus'],
  etc: ['etcetera'],
  gonna: ['going'],
  wanna: ['want'],
  gotta: ['got'],
  till: ['until'],
  til: ['until'],
  thru: ['through'],
  colour: ['color'],
  color: ['colour'],
  favourite: ['favorite'],
  favorite: ['favourite'],
  theatre: ['theater'],
  theater: ['theatre'],
  ai: ['a', 'i']
}
