import type { Field, JSONField } from 'payload'

import { json as jsonFieldValidation } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { Lectures } from '@/collections/Lectures/Lectures'
import { Managers } from '@/collections/Managers/Managers'
import { Meditations } from '@/collections/Meditations/Meditations'
import { Videos } from '@/collections/Videos/Videos'
import { FILE_METADATA_SCHEMA_URI } from '@/fields'
import { LECTURE_METADATA_SCHEMA_URI } from '@/lib/lectures/nirmalaVidya'
import { MEDITATION_FRAMES_SCHEMA_URI, NODE_WEIGHTS_SCHEMA_URI } from '@/lib/meditations/frames'
import { TableOfContentsBlock } from '@/lib/richEditor/blocks/TableOfContentsBlock'
import { SUBTITLES_SCHEMA_URI } from '@/lib/utilities/subtitles'

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

  it('refuses a key the builder never writes, and an unknown locale', () => {
    expect(runSchema(field, { hlsUrl: 'https://example.com/a.m3u8', vimeoId: 7 })).not.toBe(true)
    expect(runSchema(field, { subtitles: { klingon: 'https://example.com/k.vtt' } })).not.toBe(true)
  })
})

describe('Managers.notificationPreferences', () => {
  const field = jsonField(Managers.fields, 'notificationPreferences')

  it('composes the built-in validator rather than replacing it', () => {
    // The regression this guards: supplying `validate` takes over from the
    // built-in one, so a schema beside a custom validator silently does
    // nothing. Both halves must reject.
    expect(runFieldValidate(field, { not_a_notification_type: {} })).not.toBe(true)
    expect(
      runFieldValidate(field, { event_registration: { frequency: 'Immediate', method: '' } }),
    ).toMatch(/Event Registration/)
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
    // One good entry and one with no timestamp. Normalization drops the second
    // and still counts one frame, so the custom rule alone passes this — only
    // the schema half rejects it. That asymmetry is what makes this case fail
    // when the composition is dropped.
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

describe('TableOfContentsBlock.headings', () => {
  const field = jsonField(TableOfContentsBlock.fields, 'headings')

  it('accepts what the field component stores, and refuses a heading with no slug', () => {
    expect(runSchema(field, [{ slug: 'intro', text: 'Introduction', level: 2 }])).toBe(true)
    expect(runSchema(field, [{ text: 'Introduction', level: 2 }])).not.toBe(true)
  })
})
