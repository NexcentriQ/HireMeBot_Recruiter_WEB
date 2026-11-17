import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../sha256'

function blobFromString(s: string): Blob {
  return new Blob([new TextEncoder().encode(s)])
}

describe('sha256Hex', () => {
  it('returns the known SHA-256 of an empty input', async () => {
    const digest = await sha256Hex(new Blob([]))
    expect(digest).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('returns the known SHA-256 of "abc"', async () => {
    const digest = await sha256Hex(blobFromString('abc'))
    expect(digest).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('produces a 64-char lowercase hex string', async () => {
    const digest = await sha256Hex(blobFromString('hello world'))
    expect(digest).toHaveLength(64)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is content-addressed: same bytes under different names hash the same', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const a = await sha256Hex(new File([payload], 'resume.pdf'))
    const b = await sha256Hex(new File([payload], 'someone-elses.pdf'))
    expect(a).toBe(b)
  })

  it('is sensitive to content changes', async () => {
    const a = await sha256Hex(blobFromString('abc'))
    const b = await sha256Hex(blobFromString('abd'))
    expect(a).not.toBe(b)
  })
})
