import { describe, it, expect } from 'vitest'

import { checkBasicAuth } from '../../src/lib/openapi/scalarPlugin'

const PASSWORD = 'correcthorsebatterystaple'

function basicHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

describe('checkBasicAuth', () => {
  it('returns false for empty Authorization header', () => {
    expect(checkBasicAuth('', PASSWORD)).toBe(false)
  })

  it('returns false for Bearer token (wrong scheme)', () => {
    expect(checkBasicAuth(`Bearer ${btoa('user:' + PASSWORD)}`, PASSWORD)).toBe(false)
  })

  it('returns true for correct password with any username', () => {
    expect(checkBasicAuth(basicHeader('admin', PASSWORD), PASSWORD)).toBe(true)
    expect(checkBasicAuth(basicHeader('', PASSWORD), PASSWORD)).toBe(true)
    expect(checkBasicAuth(basicHeader('user@example.com', PASSWORD), PASSWORD)).toBe(true)
  })

  it('returns false for wrong password', () => {
    expect(checkBasicAuth(basicHeader('admin', 'wrongpassword'), PASSWORD)).toBe(false)
  })

  it('returns false for invalid base64', () => {
    expect(checkBasicAuth('Basic !!!not-base64!!!', PASSWORD)).toBe(false)
  })

  it('handles password containing colons', () => {
    const complexPassword = 'pass:word:with:colons'
    expect(checkBasicAuth(basicHeader('user', complexPassword), complexPassword)).toBe(true)
  })
})
