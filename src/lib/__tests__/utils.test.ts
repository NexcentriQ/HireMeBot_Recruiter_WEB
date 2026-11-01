import { describe, expect, it } from 'vitest'
import { cn, getInitials, formatDate, isSameDay } from '../utils'

describe('cn', () => {
  it('merges tailwind classes and drops duplicates', () => {
    expect(cn('p-2 p-4', 'text-sm')).toBe('p-4 text-sm')
  })

  it('ignores falsy values', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b')
  })
})

describe('getInitials', () => {
  it('returns one letter for single-word names', () => {
    expect(getInitials('Alice')).toBe('AL')
  })
  it('returns first and last initials for multi-word names', () => {
    expect(getInitials('Rahul Sharma')).toBe('RS')
    expect(getInitials('Priya Sri Reddy')).toBe('PR')
  })
  it('handles empty input', () => {
    expect(getInitials('')).toBe('')
  })
})

describe('formatDate', () => {
  it('returns an em-dash for null-ish input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
  it('formats ISO strings into human dates', () => {
    const out = formatDate('2026-10-31T12:00:00Z')
    expect(out).toMatch(/2026/)
  })
})

describe('isSameDay', () => {
  it('compares calendar day only', () => {
    const a = new Date('2026-01-01T01:00:00')
    const b = new Date('2026-01-01T23:00:00')
    expect(isSameDay(a, b)).toBe(true)
  })
  it('returns false across days', () => {
    const a = new Date('2026-01-01T23:00:00')
    const b = new Date('2026-01-02T00:30:00')
    expect(isSameDay(a, b)).toBe(false)
  })
})
