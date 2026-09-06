import type { Field, JSONField } from 'payload'

import { json as jsonFieldValidation } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { AppCards, VIEW_SCHEDULE_SCHEMA_URI } from '@/collections/AppCards/AppCards'
import { Clients } from '@/collections/Clients/Clients'
import { Events } from '@/collections/Events/Events'
import { Lectures } from '@/collections/Lectures/Lectures'
import { Managers } from '@/collections/Managers/Managers'
import { Meditations, TAG_ASSIGNMENTS_SCHEMA_URI } from '@/collections/Meditations/Meditations'
import { Videos } from '@/collections/Videos/Videos'
import { FILE_METADATA_SCHEMA_URI } from '@/fields'
import { WeMeditateAppStatus } from '@/globals/WeMeditateAppStatus/WeMeditateAppStatus'
import { EVENT_QUALITY_REPORT_SCHEMA_URI } from '@/lib/eventQuality'
import { LECTURE_METADATA_SCHEMA_URI } from '@/lib/lectures/nirmalaVidya'
import { MEDITATION_FRAMES_SCHEMA_URI, NODE_WEIGHTS_SCHEMA_URI } from '@/lib/meditations/frames'
import { TableOfContentsBlock } from '@/lib/richEditor/blocks/TableOfContentsBlock'
import { UPCOMING_DATES_SCHEMA_URI } from '@/lib/schedule/scheduleHooks'
import type { ReadinessReport } from '@/lib/status'
import { READINESS_REPORT_SCHEMA_URI } from '@/lib/status/virtualReadinessField'
import { SUBTITLES_SCHEMA_URI } from '@/lib/utilities/subtitles'
import { ABUSE_SCORE_SCHEMA_URI, type AbuseScore } from '@/plugins/usage'

/**
 * #659: every JSON column that can state its shape now declares a `jsonSchema`,
 * so Payload both generates its type and refuses a write it does not describe.
 *
 * These cases run against the **real collection configs**, not a copy of the
 * schemas. A schema that is correct but never wired onto its field would
 * validate perfectly here and do nothing in production — which is the failure
 * this file exists to catch.
 */

/** Walk the containers Payload nests fields in, and return the named field. */
function findField(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field
    if ('fields' in field && Array.isArray(field.fields)) {
      const hit = findField(field.fields, name)
      if (hit) return hit
    }
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        const hit = findField(tab.fields, name)
        if (hit) return hit
      }
    }
  }
  return undefined
}

function jsonField(fields: Field[], name: string): JSONField {
  const field = findField(fields, name)
  if (!field || field.type !== 'json') throw new Error(`no json field named ${name}`)
  return field
}

/** Payload's built-in validator, with the minimum context it reads. */
const req = { t: (key: string) => key } as never

function runSchema(field: JSONField, value: unknown): true | string {
  return jsonFieldValidation(value as never, {
    ...field,
    req,
    required: false,
  } as never) as true | string
}

/** Call the field's own `validate`, which is what a save actually runs. */
function runFieldValidate(
  field: JSONField,
  value: unknown,
  extra: Record<string, unknown> = {},
): true | string {
  if (typeof field.validate !== 'function') throw new Error('field has no validate')
  return field.validate(value as never, { ...field, req, required: false, ...extra } as never) as
    | true
    | string
}

describe('subtitles', () => {
  const field = jsonField(Videos.fields, 'subtitles')

  it('is wired onto the column', () => {
    expect(field.jsonSchema?.uri).toBe(SUBTITLES_SCHEMA_URI)
    // The hand-rolled Zod validator it replaced is gone, so the built-in one
    // (which is what runs the schema) is installed.
    expect(field.validate).toBeUndefined()
  })

  it('accepts well-formed cues', () => {
    expect(
      runSchema(field, [
        { startTimeMs: 0, endTimeMs: 1500, durationMs: 1500, content: 'Hello' },
        { startTimeMs: 1500, endTimeMs: 3500, content: 'World' },
      ]),
    ).toBe(true)
  })

  it('rejects a missing required key, a wrong type, and a non-array', () => {
    expect(runSchema(field, [{ startTimeMs: 0, content: 'no endTimeMs' }])).not.toBe(true)
    expect(runSchema(field, [{ startTimeMs: '0', endTimeMs: 1000, content: 'x' }])).not.toBe(true)
    expect(runSchema(field, { subtitles: 'not-an-array' })).not.toBe(true)
    expect(runSchema(field, 'a string')).not.toBe(true)
  })

  it('still accepts an unknown cue key, as the Zod validator did', () => {
    // Closing the shape would narrow the column: a row already storing an extra
    // key would fail every later save of its video, permanently.
    expect(
      runSchema(field, [{ startTimeMs: 0, endTimeMs: 1000, content: 'ok', speaker: 'Anna' }]),
    ).toBe(true)
  })

  it('treats every empty value as valid, exactly as the old validator did', () => {
    // `parseSubtitles` had its own `isEmpty` guard for these four. Payload's
    // built-in `json` validator skips the same four before touching Ajv, so
    // dropping that function changed nothing about an optional column.
    for (const empty of [undefined, null, {}, []]) {
      expect(runSchema(field, empty)).toBe(true)
    }
  })
})

describe('fileMetadata', () => {
  const field = jsonField(Videos.fields, 'fileMetadata')

  it('is wired onto the column', () => {
    expect(field.jsonSchema?.uri).toBe(FILE_METADATA_SCHEMA_URI)
  })

  it('types the key every writer sets, without closing the shape', () => {
    expect(runSchema(field, { originalFilename: 'my-video.mp4' })).toBe(true)
    // A row imported under an earlier shape must stay saveable — the adapters
    // spread whatever was already there.
    expect(runSchema(field, { originalFilename: 'a.mp4', duration: 12 })).toBe(true)
    expect(runSchema(field, { originalFilename: 42 })).not.toBe(true)
  })
})

describe('Lectures.metadata', () => {
  const field = jsonField(Lectures.fields, 'metadata')

  it('is wired onto the column', () => {
    expect(field.jsonSchema?.uri).toBe(LECTURE_METADATA_SCHEMA_URI)
  })

  it('accepts what buildLectureMetadata produces', () => {
    expect(
      runSchema(field, {
        title: 'A talk',
        thumbnailUrl: null,
        hlsUrl: 'https://example.com/a.m3u8',
        subtitles: { en: 'https://example.com/en.vtt', 'pt-BR': 'https://example.com/pt.vtt' },
        duration: 2400,
        lastSyncedAt: '2026-09-05T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('refuses a key the builder never writes', () => {
    expect(runSchema(field, { hlsUrl: 'https://example.com/a.m3u8', vimeoId: 7 })).not.toBe(true)
  })

  it('keeps the subtitle map open, so retiring a locale strands no row', () => {
    expect(runSchema(field, { subtitles: { 'no-longer-a-locale': 'https://x/k.vtt' } })).toBe(true)
    expect(runSchema(field, { subtitles: { en: 7 } })).not.toBe(true)
  })
})

describe('Managers.notificationPreferences', () => {
  const field = jsonField(Managers.fields, 'notificationPreferences')

  it('composes the built-in validator rather than replacing it', () => {
    // The regression this guards: supplying `validate` takes over from the
    // built-in one, so a schema beside a custom validator silently does
    // nothing. Both halves must reject.
    // `method: 5` passes the cross-key rule (the frequency is "Never", so no
    // method is required) and fails the schema. Only the composition rejects it.
    expect(
      runFieldValidate(field, { event_registration: { frequency: 'Never', method: 5 } }),
    ).not.toBe(true)
    expect(
      runFieldValidate(field, { event_registration: { frequency: 'Immediate', method: '' } }),
    ).toMatch(/Event Registration/)
  })

  it('keeps the top level open, so a retired notification type strands no manager', () => {
    expect(runFieldValidate(field, { a_retired_type: { frequency: 'Never', method: '' } })).toBe(
      true,
    )
  })

  it('types a retired key without closing it', () => {
    // `additionalProperties` is a schema, not `true`, so the generated index
    // signature is usable at a dynamic key — which is what deleted the
    // hand-written aliases and their four consumer casts. The value stays
    // open, for the same reason the top level does.
    expect(
      runFieldValidate(field, { a_retired_type: { frequency: 'Never', extra: 'kept' } }),
    ).toBe(true)
    expect(runFieldValidate(field, { a_retired_type: 'Never' })).not.toBe(true)
  })

  it('accepts the seeded default', () => {
    expect(
      runFieldValidate(field, {
        new_responsibility: { frequency: 'Immediate', method: 'email' },
        event_verification: { frequency: 'Monthly', method: 'email' },
        event_registration: { frequency: 'Immediate', method: 'email' },
        regional_summary: { frequency: 'Monthly', method: 'email' },
      }),
    ).toBe(true)
  })
})

describe('Meditations', () => {
  const frames = jsonField(Meditations.fields, 'frames')
  const weights = jsonField(Meditations.fields, 'subtleSystemNodeWeights')

  it('wires both columns', () => {
    expect(frames.jsonSchema?.uri).toBe(MEDITATION_FRAMES_SCHEMA_URI)
    expect(weights.jsonSchema?.uri).toBe(NODE_WEIGHTS_SCHEMA_URI)
  })

  it('composes the built-in validator on frames rather than replacing it', () => {
    // One good entry and one with no timestamp. The custom rule alone passes
    // this (normalization drops the second and still counts one frame), so only
    // the schema half rejects it — which is what makes this case fail when the
    // composition is dropped. On a real save the field's `beforeChange` hook
    // normalizes first, so the schema types the stored value rather than gating
    // it; the composition is still the rule, not an optimisation.
    expect(
      runFieldValidate(frames, [{ id: 1, timestamp: 0 }, { id: 2 }], { operation: 'update' }),
    ).not.toBe(true)
    // And the rule no schema can state.
    expect(runFieldValidate(frames, [], { operation: 'update' })).toBe(
      'At least one frame is required',
    )
  })

  it('keeps the enriched shape the admin posts back', () => {
    // `afterRead` hands FrameListManager whole Frame documents, and the form
    // submits them unchanged — so entries must stay open.
    expect(
      runFieldValidate(frames, [{ id: 3, timestamp: 1.5, filename: 'a.mp4', gender: 'female' }], {
        operation: 'update',
      }),
    ).toBe(true)
  })

  it('accepts a node-weight map and refuses a non-numeric weight', () => {
    expect(runSchema(weights, { 'left-nabhi': 12.5, agnya: 4 })).toBe(true)
    expect(runSchema(weights, { agnya: 'four' })).not.toBe(true)
  })
})

/**
 * The six virtual JSON columns. Nothing stores these — an `afterRead` hook is
 * each one's only writer — so the schema buys the generated type rather than a
 * write gate, and can be closed without stranding a row written under an
 * earlier shape.
 *
 * Each case asserts the schema is wired onto the **real** field and that it
 * accepts what its hook returns while refusing a drifted shape. A schema that
 * stopped matching its hook's output would still pass a test written against a
 * copy of the schema, which is why these read the configs.
 */
describe('virtual columns', () => {
  it('types AppCards.viewSchedule as the hook returns it', () => {
    const field = jsonField(AppCards.fields, 'viewSchedule')
    expect(field.jsonSchema?.uri).toBe(VIEW_SCHEDULE_SCHEMA_URI)
    expect(runSchema(field, { timezone: 'Europe/Amsterdam', schedule: { '00:00': 'default' } })).toBe(
      true,
    )
    // A view name the hook cannot emit, and the timezone the hook always sets.
    expect(runSchema(field, { timezone: 'UTC', schedule: { '00:00': 'unknown' } })).not.toBe(true)
    expect(runSchema(field, { schedule: { '00:00': 'default' } })).not.toBe(true)
  })

  it('types Clients.usage.abuseScore as `AbuseScore`', () => {
    const field = jsonField(Clients.fields, 'abuseScore')
    expect(field.jsonSchema?.uri).toBe(ABUSE_SCORE_SCHEMA_URI)
    const score: AbuseScore = {
      score: 42,
      level: 'elevated',
      breakdown: { frequency: 12, recency: 20, current: 10 },
    }
    expect(runSchema(field, score)).toBe(true)
    // `calculateAbuseScore` always fills the whole breakdown.
    expect(runSchema(field, { ...score, breakdown: { frequency: 12, recency: 20 } })).not.toBe(true)
    expect(runSchema(field, { ...score, level: 'severe' })).not.toBe(true)
  })

  it('keeps both arms of Events.qualityReport discriminated', () => {
    const field = jsonField(Events.fields, 'qualityReport')
    expect(field.jsonSchema?.uri).toBe(EVENT_QUALITY_REPORT_SCHEMA_URI)
    expect(runSchema(field, { skipped: true, reason: 'unpublished' })).toBe(true)
    expect(
      runSchema(field, {
        skipped: false,
        checks: [{ key: 'has-description', status: 'failed', detail: 'Too short' }],
        openCount: 1,
      }),
    ).toBe(true)
    // Crossing the two arms is what `oneOf` exists to refuse — a skipped report
    // carrying checks would let a reader narrow on `skipped` and still be wrong.
    expect(runSchema(field, { skipped: true, reason: 'finished', openCount: 0 })).not.toBe(true)
    expect(runSchema(field, { skipped: false, openCount: 0 })).not.toBe(true)
  })

  it('types the Meditations virtual join columns', () => {
    const field = jsonField(Meditations.fields, 'asMorningMeditation')
    expect(field.jsonSchema?.uri).toBe(TAG_ASSIGNMENTS_SCHEMA_URI)
    expect(runSchema(field, [{ id: 7, title: 'Morning' }])).toBe(true)
    // The hook selects exactly these two keys off a numeric primary key, and
    // `TagAssignmentField` hands the id straight to `useDocumentDrawer`.
    expect(runSchema(field, [{ id: '7', title: 'Morning' }])).not.toBe(true)
    expect(runSchema(field, [{ id: 7 }])).not.toBe(true)
  })

  it('types schedule.upcomingDates as ISO strings', () => {
    const field = jsonField(Events.fields, 'upcomingDates')
    expect(field.jsonSchema?.uri).toBe(UPCOMING_DATES_SCHEMA_URI)
    expect(runSchema(field, ['2026-09-07T18:00:00.000Z'])).toBe(true)
    expect(runSchema(field, [1757269200000])).not.toBe(true)
  })

  it('types a readiness section as `ReadinessReport`, groups discriminated', () => {
    const field = jsonField(WeMeditateAppStatus.fields, 'appCards')
    expect(field.jsonSchema?.uri).toBe(READINESS_REPORT_SCHEMA_URI)
    const report: ReadinessReport = {
      groups: [
        {
          type: 'aggregate',
          key: 'launch-critical-cards',
          passed: true,
          actual: 3,
          threshold: 3,
          passing: true,
          counter: { current: 3, total: 3 },
        },
        { type: 'errored', key: 'other-cards', error: 'boom', passing: false, counter: null },
      ],
      summary: { total: 2, passing: 1 },
      passing: false,
      progress: { passing: 3, total: 3 },
    }
    expect(runSchema(field, report)).toBe(true)
    // An errored group never passes and never carries a counter — both are
    // baked facts the widget reads without re-deriving them.
    expect(
      runSchema(field, {
        ...report,
        groups: [{ type: 'errored', key: 'x', error: 'boom', passing: true, counter: null }],
      }),
    ).not.toBe(true)
    expect(runSchema(field, { ...report, groups: [{ type: 'documents', key: 'x' }] })).not.toBe(true)
  })
})

describe('TableOfContentsBlock.headings', () => {
  const field = jsonField(TableOfContentsBlock.fields, 'headings')

  it('accepts what the field component stores, and refuses a heading with no slug', () => {
    expect(runSchema(field, [{ slug: 'intro', text: 'Introduction', level: 2 }])).toBe(true)
    expect(runSchema(field, [{ text: 'Introduction', level: 2 }])).not.toBe(true)
  })
})
