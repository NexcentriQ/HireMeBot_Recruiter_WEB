import { describe, expect, it } from 'vitest'
import { cn, getInitials } from '../utils'

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
