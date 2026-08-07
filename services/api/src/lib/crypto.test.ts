// ============================================================
// TASKPILOT API — SECRET ENCRYPTION TESTS
// services/api/src/lib/crypto.test.ts
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'

import {
  encryptSecret,
  decryptSecret,
  hasEncryptionKey,
  resetEncryptionKey,
  safeCompare,
  randomToken,
  ENCRYPTION_KEY_VAR,
} from './crypto'

const KEY_HEX = randomBytes(32).toString('hex')
const OTHER_KEY_HEX = randomBytes(32).toString('hex')

function setKey(value: string | undefined) {
  if (value === undefined) delete process.env[ENCRYPTION_KEY_VAR]
  else process.env[ENCRYPTION_KEY_VAR] = value
  resetEncryptionKey()
}

let saved: string | undefined

beforeEach(() => {
  saved = process.env[ENCRYPTION_KEY_VAR]
  setKey(KEY_HEX)
})

afterEach(() => {
  setKey(saved)
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a token', () => {
    const secret = 'pat-na1-' + randomBytes(24).toString('hex')
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  it('round-trips unicode and long values', () => {
    const secret = '🔐 refresh—token ' + 'x'.repeat(4096)
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  it('produces different ciphertext each time for the same input', () => {
    // A fresh IV per encryption. Identical ciphertext would leak that two
    // users hold the same token, and reusing an IV breaks GCM outright.
    const a = encryptSecret('same-value')
    const b = encryptSecret('same-value')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe(decryptSecret(b))
  })

  it('emits a self-describing versioned envelope', () => {
    const parts = encryptSecret('value').split(':')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
    // 12-byte IV and 16-byte tag, base64 encoded.
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(12)
    expect(Buffer.from(parts[2], 'base64')).toHaveLength(16)
  })

  it('accepts a base64 key as well as hex', () => {
    const raw = randomBytes(32)
    setKey(raw.toString('base64'))
    const encrypted = encryptSecret('via-base64')
    expect(decryptSecret(encrypted)).toBe('via-base64')
  })

  it('refuses to encrypt an empty secret', () => {
    expect(() => encryptSecret('')).toThrow(/empty/i)
  })
})

describe('tamper and key failures', () => {
  it('rejects a modified ciphertext instead of returning garbage', () => {
    // This is the property that makes GCM the right choice: without the
    // auth tag, flipping bits would yield attacker-influenced plaintext.
    const encrypted = encryptSecret('sensitive')
    const [v, iv, tag, data] = encrypted.split(':')
    const bytes = Buffer.from(data, 'base64')
    bytes[0] ^= 0xff

    expect(() => decryptSecret([v, iv, tag, bytes.toString('base64')].join(':'))).toThrow(
      /could not be decrypted/i
    )
  })

  it('rejects a modified auth tag', () => {
    const [v, iv, tag, data] = encryptSecret('sensitive').split(':')
    const bytes = Buffer.from(tag, 'base64')
    bytes[0] ^= 0xff
    expect(() => decryptSecret([v, iv, bytes.toString('base64'), data].join(':'))).toThrow()
  })

  it('cannot decrypt with a different key', () => {
    const encrypted = encryptSecret('sensitive')
    setKey(OTHER_KEY_HEX)
    expect(() => decryptSecret(encrypted)).toThrow(/different key|could not be decrypted/i)
  })

  it('names the format problem for a plaintext (pre-encryption) row', () => {
    // The message has to distinguish "legacy row" from "key is wrong",
    // because the operator response differs completely.
    expect(() => decryptSecret('an-old-plaintext-token')).toThrow(/predates token encryption/i)
  })

  it('rejects an envelope with a wrong-sized IV', () => {
    const [v, , tag, data] = encryptSecret('x').split(':')
    const shortIv = Buffer.alloc(8).toString('base64')
    expect(() => decryptSecret([v, shortIv, tag, data].join(':'))).toThrow(/malformed/i)
  })
})

describe('key configuration', () => {
  it('reports missing configuration rather than throwing', () => {
    setKey(undefined)
    expect(hasEncryptionKey()).toBe(false)
  })

  it('names the variable and how to generate one', () => {
    setKey(undefined)
    expect(() => encryptSecret('x')).toThrow(new RegExp(ENCRYPTION_KEY_VAR))
    expect(() => encryptSecret('x')).toThrow(/randomBytes\(32\)/)
  })

  it('rejects a key that is not 32 bytes', () => {
    // A short key silently weakens every stored token, so it must fail loudly.
    setKey(randomBytes(16).toString('hex'))
    expect(hasEncryptionKey()).toBe(false)
    expect(() => encryptSecret('x')).toThrow(/32 bytes/)
  })

  it('rejects a non-hex, non-base64 key', () => {
    setKey('not a valid key at all')
    expect(hasEncryptionKey()).toBe(false)
  })
})

describe('safeCompare', () => {
  it('matches identical strings', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true)
  })

  it('rejects different strings of equal length', () => {
    expect(safeCompare('abc123', 'abc124')).toBe(false)
  })

  it('rejects different lengths without throwing', () => {
    // timingSafeEqual throws on a length mismatch; the wrapper must not.
    expect(safeCompare('short', 'much-longer-value')).toBe(false)
  })

  it('handles empty strings', () => {
    expect(safeCompare('', '')).toBe(true)
    expect(safeCompare('', 'x')).toBe(false)
  })
})

describe('randomToken', () => {
  it('is URL-safe', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomToken()))
    expect(seen.size).toBe(200)
  })
})
