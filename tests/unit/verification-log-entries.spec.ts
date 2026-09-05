/**
 * The verification log's display cells, which its **entry builders** now emit.
 *
 * They used to be computed at render time by a bespoke component
 * (`NotificationLogTable/format.ts`, deleted). Moving the wording to the
 * builders is what let one shared `LogTable` render this log: the code that
 * knows a reminder's escalation level and recipient tier is the code that
 * writes the entry, so it says what happened rather than leaving a component to
 * infer it.
 *
 * The machine fields (`kind`, `stage`, `manager.id`) are asserted alongside,
 * because `hasReminderForStage` reads them back as data — display is additive,
 * never a replacement.
 */
import { describe, expect, it } from 'vitest'

import { buildReminderEntry, buildVerificationEntry } from '@/lib/eventVerification/log'

const AT = '2026-06-13T14:30:00.000Z'
const MANAGER = { id: 7, name: 'Jane Doe' }

describe('buildVerificationEntry', () => {
  it('says what happened, who did it, and how', () => {
    expect(buildVerificationEntry('verify-action', MANAGER, AT)).toMatchObject({
      kind: 'verification',
      type: 'verification',
      at: AT,
      cells: { activity: 'Verified', who: 'Jane Doe', delivery: 'Verify button' },
    })
  })

  it('names the importer, which verifies with no acting manager', () => {
    expect(buildVerificationEntry('import', null, AT).cells.who).toBe('Sahaj Atlas Import')
  })

  it('falls back to #id when an actor has no name', () => {
    expect(buildVerificationEntry('re-save', { id: 42, name: '' }, AT).cells.who).toBe('#42')
  })

  it('humanises an unrecognised method rather than showing the slug raw', () => {
    // The union is closed today. This is the guard for the next member.
    const entry = buildVerificationEntry('some-new-method' as never, MANAGER, AT)
    expect(entry.cells.delivery).toBe('Some New Method')
  })
})

describe('buildReminderEntry', () => {
  const base = {
    stage: 'verified' as const,
    level: 'due' as const,
    role: 'manager' as const,
    manager: MANAGER,
    channel: 'email',
    destination: 'jane@example.com',
    at: AT,
  }

  it('labels the escalation level and shows the recipient tier', () => {
    expect(buildReminderEntry(base)).toMatchObject({
      kind: 'reminder',
      type: 'reminder',
      // Machine fields the exactly-once guard reads back.
      stage: 'verified',
      manager: MANAGER,
      // Display cells.
      cells: {
        activity: 'Reminder',
        who: { text: 'Jane Doe', sub: 'Event manager' },
        delivery: { label: 'email', text: 'jane@example.com' },
      },
    })
  })

  it('names the linking region for a region manager, so scope is obvious', () => {
    const entry = buildReminderEntry({
      ...base,
      level: 'escalated',
      role: 'region',
      region: 'Bay Area',
    })
    expect(entry.cells.activity).toBe('Escalation')
    expect(entry.cells.who).toEqual({ text: 'Jane Doe', sub: 'Region manager · Bay Area' })
  })

  it('labels each escalation level distinctly', () => {
    const activity = (level: 'due' | 'escalated' | 'urgent' | 'expired') =>
      buildReminderEntry({ ...base, level }).cells.activity
    expect([
      activity('due'),
      activity('escalated'),
      activity('urgent'),
      activity('expired'),
    ]).toEqual(['Reminder', 'Escalation', 'Final reminder', 'Unpublished notice'])
  })
})
