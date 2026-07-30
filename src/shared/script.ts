/**
 * Script preprocessing: markdown → render blocks + a flat match index.
 * One function is the single source of truth for both the prompter renderer
 * and the aligner, so display indices agree by construction.
 */
import { Lexer, type Token, type Tokens } from 'marked'
import { expandNumberToken, WORD_ALTS } from './numwords'

export type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blockquote' | 'hr' | 'code'

export interface RenderSpan {
  /** Visible text of this word (original casing/punctuation, no trailing space). */
  text: string
  /** Global display index — unique per span, referenced by MatchWord.display. */
  display: number
  strong?: boolean
  em?: boolean
}

export interface RenderBlock {
  type: BlockType
  spans: RenderSpan[]
  /** Raw text for non-spoken blocks (code, hr). */
  raw?: string
}

export interface MatchWord {
  /** Normalized form used for matching. */
  norm: string
  /** Alternate single-word forms that also match. */
  alts?: string[]
  /** Display span this word belongs to (many-to-one for hyphens/numbers). */
  display: number
}

export interface ScriptIndex {
  words: MatchWord[]
  displayCount: number
}

export interface ParsedScript {
  blocks: RenderBlock[]
  index: ScriptIndex
}

/** Normalize a word for matching: NFKD, strip diacritics/punct, lowercase, drop apostrophes. */
export function normalizeWord(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Normalize an ASR hypothesis string into match tokens. Digit tokens expand to
 * their spoken form ("1984" → nineteen eighty four) so recognizers that emit
 * numerals (NeMo Parakeet) match the script's expanded number sequences.
 */
export function normalizeHypothesis(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue
    const stripped = raw.replace(/[.,;:!?"'()[\]]+$/g, '')
    if (/\d/.test(stripped)) {
      const num = expandNumberToken(stripped)
      if (num) {
        out.push(...num.words)
        continue
      }
    }
    const norm = normalizeWord(raw)
    if (norm) out.push(norm)
  }
  return out
}

interface Ctx {
  blocks: RenderBlock[]
  words: MatchWord[]
  display: number
}

/** Split inline text into visible word chunks (whitespace-separated). */
function pushText(ctx: Ctx, block: RenderBlock, text: string, strong: boolean, em: boolean): void {
  for (const chunk of text.split(/\s+/)) {
    if (!chunk) continue
    const display = ctx.display++
    const span: RenderSpan = { text: chunk, display }
    if (strong) span.strong = true
    if (em) span.em = true
    block.spans.push(span)

    // Number forms expand into spoken-word sequences, all mapped to this span.
    const numeric = expandNumberToken(chunk.replace(/[.,;:!?"'()[\]]+$/g, ''))
    if (numeric) {
      for (const w of numeric.words) ctx.words.push({ norm: w, display })
      continue
    }

    // Hyphenated words match as their parts, all pointing at the one span.
    const parts = chunk.split(/[-–—/]/).filter(Boolean)
    for (const part of parts) {
      const norm = normalizeWord(part)
      if (!norm) continue
      const alts = WORD_ALTS[norm]
      ctx.words.push(alts ? { norm, alts, display } : { norm, display })
    }
  }
}

function walkInline(ctx: Ctx, block: RenderBlock, tokens: Token[], strong = false, em = false): void {
  for (const tok of tokens) {
    switch (tok.type) {
      case 'strong':
        walkInline(ctx, block, (tok as Tokens.Strong).tokens ?? [], true, em)
        break
      case 'em':
        walkInline(ctx, block, (tok as Tokens.Em).tokens ?? [], strong, true)
        break
      case 'link':
        walkInline(ctx, block, (tok as Tokens.Link).tokens ?? [], strong, em)
        break
      case 'del':
        // struck-through text is deliberately not spoken nor rendered
        break
      case 'codespan':
        pushText(ctx, block, (tok as Tokens.Codespan).text, strong, em)
        break
      case 'image':
        break
      case 'br':
        break
      case 'escape':
      case 'text': {
        const t = tok as Tokens.Text
        if (t.tokens && t.tokens.length > 0) walkInline(ctx, block, t.tokens, strong, em)
        else pushText(ctx, block, t.text, strong, em)
        break
      }
      default:
        if ('text' in tok && typeof tok.text === 'string') {
          pushText(ctx, block, tok.text, strong, em)
        }
    }
  }
}

function headingType(depth: number): BlockType {
  if (depth <= 1) return 'h1'
  if (depth === 2) return 'h2'
  return 'h3'
}

function walkBlocks(ctx: Ctx, tokens: Token[]): void {
  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading': {
        const block: RenderBlock = { type: headingType((tok as Tokens.Heading).depth), spans: [] }
        walkInline(ctx, block, (tok as Tokens.Heading).tokens ?? [])
        ctx.blocks.push(block)
        break
      }
      case 'paragraph': {
        const block: RenderBlock = { type: 'p', spans: [] }
        walkInline(ctx, block, (tok as Tokens.Paragraph).tokens ?? [])
        ctx.blocks.push(block)
        break
      }
      case 'blockquote': {
        // flatten quote contents into one blockquote block
        const block: RenderBlock = { type: 'blockquote', spans: [] }
        for (const inner of (tok as Tokens.Blockquote).tokens ?? []) {
          if (inner.type === 'paragraph') walkInline(ctx, block, (inner as Tokens.Paragraph).tokens ?? [])
          else if ('text' in inner && typeof inner.text === 'string') pushText(ctx, block, inner.text, false, false)
        }
        ctx.blocks.push(block)
        break
      }
      case 'list': {
        for (const item of (tok as Tokens.List).items) {
          const block: RenderBlock = { type: 'li', spans: [] }
          const nested: Token[] = []
          for (const inner of item.tokens ?? []) {
            if (inner.type === 'list') {
              nested.push(inner)
            } else if (inner.type === 'text' || inner.type === 'paragraph') {
              const t = inner as Tokens.Text
              if (t.tokens && t.tokens.length > 0) walkInline(ctx, block, t.tokens)
              else if (typeof t.text === 'string') pushText(ctx, block, t.text, false, false)
            }
          }
          if (block.spans.length > 0) ctx.blocks.push(block)
          // nested lists flatten to further li blocks after their parent item
          walkBlocks(ctx, nested)
        }
        break
      }
      case 'code':
        // rendered but never spoken — no MatchWords
        ctx.blocks.push({ type: 'code', spans: [], raw: (tok as Tokens.Code).text })
        break
      case 'hr':
        ctx.blocks.push({ type: 'hr', spans: [] })
        break
      case 'space':
        break
      default:
        if ('tokens' in tok && Array.isArray(tok.tokens)) {
          const block: RenderBlock = { type: 'p', spans: [] }
          walkInline(ctx, block, tok.tokens)
          if (block.spans.length > 0) ctx.blocks.push(block)
        } else if ('text' in tok && typeof tok.text === 'string') {
          const block: RenderBlock = { type: 'p', spans: [] }
          pushText(ctx, block, tok.text, false, false)
          if (block.spans.length > 0) ctx.blocks.push(block)
        }
    }
  }
}

export function parseScript(markdown: string): ParsedScript {
  const ctx: Ctx = { blocks: [], words: [], display: 0 }
  const tokens = new Lexer({ gfm: true }).lex(markdown)
  walkBlocks(ctx, tokens)
  return {
    blocks: ctx.blocks,
    index: { words: ctx.words, displayCount: ctx.display }
  }
}
