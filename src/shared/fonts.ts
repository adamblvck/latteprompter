import type { FontId } from './types'

export interface PrompterFont {
  id: FontId
  label: string
  /** Must match an @font-face family in styles/fonts.css (or a system stack). */
  cssFamily: string
  kind: 'sans' | 'serif' | 'dyslexic' | 'system'
}

export const PROMPTER_FONTS: PrompterFont[] = [
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    cssFamily: "'Atkinson Hyperlegible', sans-serif",
    kind: 'sans'
  },
  { id: 'inter', label: 'Inter', cssFamily: "'Inter', sans-serif", kind: 'sans' },
  { id: 'literata', label: 'Literata', cssFamily: "'Literata', serif", kind: 'serif' },
  {
    id: 'opendyslexic',
    label: 'OpenDyslexic',
    cssFamily: "'OpenDyslexic', sans-serif",
    kind: 'dyslexic'
  },
  { id: 'system', label: 'System', cssFamily: 'system-ui, sans-serif', kind: 'system' }
]

export function fontById(id: FontId): PrompterFont {
  return PROMPTER_FONTS.find((f) => f.id === id) ?? PROMPTER_FONTS[0]
}
