import { describe, it, expect } from 'vitest'
import { relativeTime } from './relativeTime'

describe('relativeTime', () => {
  const now = new Date('2026-07-30T12:00:00Z')
  it('labels recent times', () => {
    expect(relativeTime('2026-07-30T11:59:40Z', now)).toBe('just now')
    expect(relativeTime('2026-07-30T11:45:00Z', now)).toBe('15 min ago')
    expect(relativeTime('2026-07-30T09:00:00Z', now)).toBe('3h ago')
    expect(relativeTime('2026-07-28T12:00:00Z', now)).toBe('2d ago')
  })
})
