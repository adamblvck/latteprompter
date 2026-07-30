import { describe, it, expect } from 'vitest'
import { createDefaultStore, createScript, createCollection, hydrateStore, defaultPrompterSettings } from './factory'
import { resolvePrompterSettings, SCHEMA_VERSION } from './types'
import { wordCount, readTimeLabel } from './readingTime'
import { downloadPlan, ASR_PRESETS, presetTotalBytes } from './asr-models'

describe('factory', () => {
  it('creates a default store with a welcome script', () => {
    const store = createDefaultStore()
    expect(store.schemaVersion).toBe(SCHEMA_VERSION)
    expect(Object.keys(store.scripts)).toHaveLength(1)
    expect(store.settings.prompterDefaults.fontId).toBe('atkinson')
  })

  it('cycles collection accents', () => {
    const a = createCollection('One', 0)
    const b = createCollection('Two', 1)
    expect(a.accent).not.toBe(b.accent)
  })

  it('creates scripts with null collection by default', () => {
    const s = createScript('Test')
    expect(s.collectionId).toBeNull()
    expect(s.promptOverrides).toBeNull()
  })

  it('hydrates partial stores with defaults', () => {
    const partial = { schemaVersion: 1, scripts: {} } as never
    const full = hydrateStore(partial)
    expect(full.settings.prompterDefaults.fontSize).toBe(56)
    expect(full.ui.themeMode).toBe('dark')
  })
})

describe('resolvePrompterSettings', () => {
  it('merges sparse overrides over defaults', () => {
    const d = defaultPrompterSettings()
    expect(resolvePrompterSettings(d, null)).toEqual(d)
    expect(resolvePrompterSettings(d, { fontSize: 80 }).fontSize).toBe(80)
    expect(resolvePrompterSettings(d, { fontSize: 80 }).fontId).toBe(d.fontId)
  })
})

describe('readingTime', () => {
  it('counts words ignoring markup', () => {
    expect(wordCount('# Hello **world** and [link](https://x.dev)')).toBe(4)
    expect(wordCount('```\ncode here\n```\nreal words')).toBe(2)
  })
  it('labels read time', () => {
    expect(readTimeLabel(300)).toBe('~2 min')
    expect(readTimeLabel(20)).toMatch(/sec/)
  })
})

describe('asr-models downloadPlan', () => {
  const preset = ASR_PRESETS[0]

  it('reports everything missing on empty disk', () => {
    const plan = downloadPlan(preset, () => null)
    expect(plan.complete).toBe(false)
    expect(plan.missing).toHaveLength(preset.files.length)
    expect(plan.totalBytes).toBe(presetTotalBytes(preset))
  })

  it('reports complete when all sizes match', () => {
    const sizes = new Map(preset.files.map((f) => [f.name, f.bytes]))
    const plan = downloadPlan(preset, (n) => sizes.get(n) ?? null)
    expect(plan.complete).toBe(true)
    expect(plan.doneBytes).toBe(plan.totalBytes)
  })

  it('treats size mismatches as missing', () => {
    const plan = downloadPlan(preset, (n) => (n === 'tokens.txt' ? 1 : null))
    expect(plan.missing.map((f) => f.name)).toContain('tokens.txt')
  })
})
