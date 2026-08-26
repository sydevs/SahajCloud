/**
 * Pure-function tests for user-message screening (#632) — the body fingerprint
 * and the one cross-module invariant the thresholds depend on. No Payload
 * bootstrap, no DB.
 */
import { describe, expect, it } from 'vitest'

import { normalizedBodyHash } from '@/collections/UserMessages/bodyHash'
import { messageVerdictNote, type MessageVerdict } from '@/collections/UserMessages/screening'
import { DELIVERED_RETENTION_DAYS } from '@/jobs/PurgeUserMessages/PurgeUserMessages'
import { HISTORY_WINDOW_HOURS } from '@/jobs/ScreenUserMessages/senderHistory'

describe('normalizedBodyHash', () => {
  const BODY = 'The venue for this class closed last month.'

  it.each([
    ['identical text', BODY],
    ['different casing', 'THE VENUE FOR THIS CLASS CLOSED LAST MONTH.'],
    ['leading/trailing whitespace', `\n  ${BODY}\t `],
    ['collapsed inner whitespace', 'The  venue for   this class\nclosed last month.'],
  ])('treats %s as the same message', (_label, variant) => {
    // The variations a spammer gets for free between sends are exactly these —
    // folding them away is what makes one hash cover the family.
    expect(normalizedBodyHash(variant)).toBe(normalizedBodyHash(BODY))
  })

  it.each([
    ['different wording', 'The venue for this class closed last year.'],
    ['one character', `${BODY}!`],
    ['empty', ''],
  ])('treats %s as a different message', (_label, variant) => {
    expect(normalizedBodyHash(variant)).not.toBe(normalizedBodyHash(BODY))
  })

  it('returns a stable hex digest', () => {
    // Stored in an indexed column, so the shape is part of the schema contract.
    expect(normalizedBodyHash(BODY)).toMatch(/^[0-9a-f]{64}$/)
    expect(normalizedBodyHash(BODY)).toBe(normalizedBodyHash(BODY))
  })
})

describe('retention outlives the screening window', () => {
  it('keeps delivered messages longer than the history checks look back', () => {
    // The failure this prevents is silent: shorten retention below the window
    // and `countRecentFromSender` / `countRecentWithBody` would be counting
    // against rows already deleted, so every message would pass. Nothing would
    // error, and no other test would notice.
    expect(DELIVERED_RETENTION_DAYS * 24).toBeGreaterThan(HISTORY_WINDOW_HOURS)
  })
})

describe('messageVerdictNote', () => {
  const SPAM_VERDICTS: MessageVerdict[] = [
    'disposable_email',
    'invalid_email',
    'no_mx_records',
    'repeat_sender',
    'duplicate_body',
  ]

  it('gives every spam verdict a sentence an admin can act on', () => {
    for (const verdict of SPAM_VERDICTS) {
      const note = messageVerdictNote(verdict)
      expect(note, `${verdict} has no note`).toBeTruthy()
      // A note is prose, not a label: it has to say what follows from the
      // finding, which is what the banner would otherwise leave the reader to
      // infer. Enum-shaped text ("no_mx_records") is the failure mode.
      expect(note).toMatch(/\.$/)
      expect(note).not.toContain('_')
    }
  })

  it('says nothing for a clean message', () => {
    expect(messageVerdictNote('ok')).toBeNull()
  })
})
