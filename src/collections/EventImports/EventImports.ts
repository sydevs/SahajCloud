import type { CollectionConfig } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'
import { baseLanguage, getLanguageOptions } from '@/lib/locales'
import { adminOnlyFieldAccess } from '@/plugins/access'

import { batchUploaderAccess } from './access'
import { MAX_IMPORT_ROWS } from './constants'
import { commitEventImport } from './endpoints/commit'
import { proposeEventImport } from './endpoints/propose'
import { resolveEventImport } from './endpoints/resolve'
import { eventImportTemplate } from './endpoints/template'
import { uploadEventImport } from './endpoints/upload'

/**
 * Staging for one bulk event import, from upload to commit.
 *
 * A batch is working state, not a record: it is **hard-deleted the moment the
 * commit succeeds**. What survives is on the events themselves — each one's
 * `activityLog` names the manager who imported it — so a provenance question is
 * answered from the event rather than from a row somebody has to keep.
 *
 * Reached only through the Import tab on a region. It is hidden from the nav for
 * that reason, and no project lists it, so it is named in
 * `RESTRICTED_COLLECTIONS` (`src/plugins/access/config/projects.ts`) — "no
 * project" otherwise reads as *shared*, and every published API key, the Atlas
 * widget's browser key included, would read every uploaded CSV.
 *
 * ⚠ **Several batches may be open on one region at once, deliberately.** There
 * is no lock: two volunteers uploading the same region's classes is a
 * duplicate-detection problem, and the commit re-runs the duplicate and slug
 * checks rather than trusting what the review step saw.
 */
export const EventImports: CollectionConfig = {
  slug: 'event-imports',
  labels: { singular: 'Event Import', plural: 'Event Imports' },
  trash: true,
  endpoints: [
    eventImportTemplate,
    uploadEventImport,
    resolveEventImport,
    proposeEventImport,
    commitEventImport,
  ],
  // `create` and `delete` are left to the generated config on purpose — it
  // already answers both with "admins only" (`access.ts`).
  access: {
    read: batchUploaderAccess,
    update: batchUploaderAccess,
  },
  admin: {
    group: 'Classes',
    defaultColumns: ['id', 'targetRegion', 'uploader', 'status', 'createdAt'],
    hidden: true,
  },
  fields: [
    // ⚠ **Neither may be re-pointed after the create.** The endpoints' subtree
    // check and `batchUploaderAccess` are computed from them, so a PATCH onto
    // another region or manager would move the batch rather than edit it.
    // `overrideAccess: true` skips field access, so the endpoints still set them.
    {
      name: 'targetRegion',
      type: 'relationship',
      relationTo: 'regions',
      required: true,
      maxDepth: 1,
      access: { update: adminOnlyFieldAccess },
    },
    {
      name: 'uploader',
      type: 'relationship',
      relationTo: 'managers',
      required: true,
      maxDepth: 1,
      access: { update: adminOnlyFieldAccess },
    },
    // ⚠ **`status` and `rows` are locked against the uploader for the same
    // reason `targetRegion` is: they are what the next step trusts.** The
    // uploader holds `update` on the whole document (`access.ts`), and `rows` is
    // `readOnly` only in the admin — a UI affordance, not access control. So
    // without these locks a `PATCH /api/event-imports/:id` could write a
    // `resolved` block of its own, at any coordinates, and set `status` to
    // `resolved`: the resolve endpoint treats a row that already has an answer
    // as finished, so the country and subdivision checks would never run on it.
    // The endpoints still write both, because they pass `overrideAccess: true`.
    // What the uploader keeps is `deletedAt` — the discard.
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'uploaded',
      access: { update: adminOnlyFieldAccess },
      options: [
        { label: 'Uploaded', value: 'uploaded' },
        { label: 'Resolved', value: 'resolved' },
        { label: 'Committing', value: 'committing' },
      ],
      admin: {
        description:
          'Written by the import endpoints. `committing` means a commit was interrupted part-way; its rows carry the ids of whatever was already created.',
      },
    },
    {
      name: 'defaultLanguages',
      type: 'select',
      hasMany: true,
      required: true,
      // The same option set as `Events.languages`, since that is where these
      // values end up for every row whose own `languages` column is blank.
      options: getLanguageOptions(),
      defaultValue: ({ req }) => [baseLanguage(req.locale)],
      admin: {
        description: 'Language(s) to use for rows whose own `languages` column is empty.',
      },
    },
    jsonField({
      name: 'rows',
      schemaTitle: 'EventImportRows',
      // One row per CSV data row, in file order, carrying `parseImportCsv`'s
      // output (`csv/parse.ts`) verbatim. The resolve and commit steps widen
      // this shape as each lands; a key declared ahead of its writer generates a
      // type a consumer can read as available, and an Ajv rule nothing
      // exercises.
      access: { update: adminOnlyFieldAccess },
      // The cap the parse step enforces, restated where the column is declared:
      // `parseImportCsv` is not the only writer once an endpoint elevates past
      // field access, and `MAX_IMPORT_ROWS` is what bounds the geocoder spend.
      schema: z.array(
        z.strictObject({
          line: z
            .int()
            .describe(
              "The row's line in the uploaded file, 1-based and counting the header, so an error names the line the volunteer's spreadsheet shows.",
            ),
          values: z
            .record(z.string(), z.string())
            .describe('The row as the CSV held it, keyed by column name and trimmed.'),
          errors: z
            .array(z.string())
            .optional()
            .describe(
              'Everything wrong with the row, from the parse, the resolve, the proposal and the commit alike. A row with any of these is skipped, never committed.',
            ),
          resolved: z
            .strictObject({
              latitude: z.number(),
              longitude: z.number(),
              timezone: z
                .string()
                .describe(
                  'IANA zone. Stored as a plain string and re-narrowed with `isSupportedTimezone` at commit, rather than repeating the 581-member enum here.',
                ),
              cityKey: z
                .string()
                .describe(
                  'The normalised city name the proposal and the duplicate check group on.',
                ),
              placeName: z.string().nullable(),
              placeId: z
                .string()
                .nullable()
                .describe('The Mapbox `place` id, which phase 5 matches an existing region on.'),
              mapboxId: z.string().nullable(),
              subdivisionCode: z.string().nullable(),
              weekdayMask: z
                .int()
                .describe(
                  'The occurrence weekdays as a 7-bit mask, Monday the low bit. Derived once so a row stays comparable across chunks.',
                ),
              startMinutes: z
                .int()
                .nullable()
                .describe("Minutes since midnight on the class's own clock."),
              languages: z.array(z.string()),
              inactive: z.boolean(),
              anchorDate: z
                .string()
                .describe(
                  "Today in the row's own zone when it resolved. The commit re-derives the schedule against it, so a run after midnight builds the first date the reviewer approved.",
                ),
            })
            .optional()
            .describe(
              'Set once the row geocoded cleanly. Its absence is what makes a row pending.',
            ),
          duplicate: z
            .strictObject({
              reason: z.enum(['nearby-address', 'city-and-time']),
              eventId: z.int().optional().describe('The existing class this row repeats.'),
              line: z
                .int()
                .optional()
                .describe('The earlier line in this same file the row repeats.'),
            })
            .optional()
            .describe(
              'A matched row is reported and skipped; nothing about the match is modified.',
            ),
          committed: z
            .strictObject({
              eventId: z.int().describe('The class this row created.'),
            })
            .optional()
            .describe(
              'Written as each row lands, so an interrupted commit resumes at the first row without one rather than creating a second class for every row before it.',
            ),
        }),
      ).max(MAX_IMPORT_ROWS),
      admin: { readOnly: true },
    }),
    jsonField({
      name: 'proposedRegions',
      schemaTitle: 'EventImportProposedRegions',
      // The region tree the batch would create, as `buildProposedTree` returns
      // it (`propose/tree.ts`). Absent until the propose endpoint has run, which
      // is what the commit step refuses on.
      access: { update: adminOnlyFieldAccess },
      // ⚠ **Closed, unlike the guidance's default for a JSON column.** The
      // propose endpoint is the column's only writer and rewrites it whole, so
      // no row can be stranded by a shape change — and a review that renames a
      // node has to fail loudly rather than save a tree the commit then walks
      // past.
      schema: z.strictObject({
        nodes: z.array(
          z.strictObject({
            key: z
              .string()
              .describe('Stable across calls, so a review can address a node it renamed.'),
            level: z.enum(['region', 'city', 'venue']),
            name: z.string(),
            parentKey: z
              .string()
              .nullable()
              .describe('The proposed node above it, or null when it hangs off the target.'),
            match: z.union([
              z.strictObject({
                kind: z.literal('existing'),
                regionId: z.int(),
                name: z.string(),
                slug: z.string().nullable(),
              }),
              z.strictObject({ kind: z.literal('create') }),
              z.strictObject({
                kind: z.literal('elsewhere'),
                regionId: z.int(),
                name: z.string(),
              }),
            ]),
            slug: z
              .string()
              .nullable()
              .describe('Null for every node the commit does not create.'),
            location: z
              .union([
                z.strictObject({ kind: z.literal('mapbox'), mapboxId: z.string() }),
                z.strictObject({
                  kind: z.literal('manual'),
                  latitude: z.number(),
                  longitude: z.number(),
                  radius: z.number(),
                }),
              ])
              .nullable()
              .describe('Null for every node the commit does not create.'),
            lines: z
              .array(z.int())
              .describe("The CSV lines this node's classes come from, the absorbed places' included."),
            merged: z
              .array(
                z.strictObject({
                  key: z.string(),
                  name: z.string(),
                  lines: z.array(z.int()),
                  subdivisionCode: z.string().nullable(),
                }),
              )
              .optional()
              .describe('What the metro rule folded into this city, so the review can say so.'),
          }),
        ).describe('Parent-first, so the commit can create them in order.'),
        rowErrors: z.array(z.strictObject({ line: z.int(), message: z.string() })),
        stateLayer: z
          .union([
            z.strictObject({
              proposed: z.literal(true),
              states: z.array(
                z.strictObject({
                  code: z.string(),
                  name: z.string(),
                  cityKeys: z.array(z.string()),
                }),
              ),
              unplacedCityKeys: z.array(z.string()),
            }),
            z.strictObject({ proposed: z.literal(false), reason: z.string() }),
          ])
          .describe('Kept with its reason, because the review has to explain a missing layer.'),
      }),
      admin: { readOnly: true },
    }),
  ],
}
