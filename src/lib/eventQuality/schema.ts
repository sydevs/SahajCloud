/**
 * The JSON-Schema twin of `EventQualityReport`, for `Events.qualityReport`.
 *
 * That column is virtual: `computeEventQualityReport` is its only writer and
 * nothing stores it, so the shape can be closed — no row exists under an
 * earlier one to strand. `event-quality.spec.ts` pins the two definitions to
 * each other, so a new key on the type fails the unit lane until it lands here.
 */
import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

export const EVENT_QUALITY_REPORT_SCHEMA_URI = 'urn:sahajcloud:schema:event-quality-report'

export const eventQualityReportJsonSchema: JSONSchema4 = {
  $id: EVENT_QUALITY_REPORT_SCHEMA_URI,
  title: 'EventQualityReport',
  // Two shapes, discriminated by `skipped`. Written as `oneOf` rather than one
  // object with optional keys so the generated type keeps the discriminator —
  // a reader that has narrowed on `skipped === false` gets `checks` non-null.
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['skipped', 'reason'],
      properties: {
        skipped: { type: 'boolean', enum: [true] },
        reason: {
          type: 'string',
          enum: ['unpublished', 'finished', 'expired', 'denied', 'trashed'],
          description: 'Why the checks were not run at all.',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['skipped', 'checks', 'openCount'],
      properties: {
        skipped: { type: 'boolean', enum: [false] },
        checks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'status'],
            properties: {
              key: { type: 'string', description: 'Stable check id, labelled elsewhere.' },
              status: { type: 'string', enum: ['passed', 'failed', 'pending'] },
              detail: {
                type: 'string',
                description: 'What went wrong, for a check folding several problems into one.',
              },
            },
          },
        },
        openCount: {
          type: 'number',
          description: 'Failed items — what `qualityOpenCount` stores.',
        },
      },
    },
  ],
}

/** The field-level wrapper Payload wants — see `Events.qualityReport`. */
export const eventQualityReportFieldSchema: JSONField['jsonSchema'] = {
  uri: EVENT_QUALITY_REPORT_SCHEMA_URI,
  fileMatch: [EVENT_QUALITY_REPORT_SCHEMA_URI],
  schema: eventQualityReportJsonSchema,
}
