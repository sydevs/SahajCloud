/**
 * Unit tests for the email/ICS text sanitizers.
 *
 * These block header and calendar-property injection, so the cases are the
 * malicious inputs: a CR/LF that would start a new header/line, and the
 * break-out characters of an unquoted display name.
 */
import { describe, expect, it } from 'vitest'

import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'

describe('stripNewlines', () => {
  it('collapses a CRLF-injected value to a single line', () => {
    expect(stripNewlines('Meditation\r\nBcc: attacker@evil.example')).toBe(
      'Meditation Bcc: attacker@evil.example',
    )
  })

  it('handles lone CR and LF', () => {
    expect(stripNewlines('a\nb')).toBe('a b')
    expect(stripNewlines('a\rb')).toBe('a b')
  })

  it('collapses runs of whitespace and trims', () => {
    expect(stripNewlines('  Weekly   Class  ')).toBe('Weekly Class')
  })

  it('preserves quotes and punctuation (legitimate in a subject)', () => {
    expect(stripNewlines('Class "Intro" — session #1')).toBe('Class "Intro" — session #1')
  })

  it('leaves an already-clean string untouched', () => {
    expect(stripNewlines('Tuesday Evening Meditation')).toBe('Tuesday Evening Meditation')
  })
})

describe('headerDisplayName', () => {
  it('strips the characters that break out of `Name <addr>`', () => {
    expect(headerDisplayName('Evil <a@b> "x"')).toBe('Evil a@b x')
  })

  it('also strips line breaks', () => {
    expect(headerDisplayName('Service\r\nBcc: x@y')).toBe('Service Bcc: x@y')
  })

  it('leaves a normal service name intact', () => {
    expect(headerDisplayName('Sahaja Yoga London')).toBe('Sahaja Yoga London')
  })
})
