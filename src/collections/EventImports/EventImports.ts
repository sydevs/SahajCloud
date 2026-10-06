import type { CollectionConfig } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'
import { baseLanguage, getLanguageOptions } from '@/lib/locales'
import type { Manager } from '@/payload-types'
import { adminOnlyFieldAccess, isAdminManager } from '@/plugins/access'

import { batchDiscardAccess, batchUploaderAccess } from './access'
import { MAX_IMPORT_ROWS } from './constants'
import { guardBatchUpdate } from './discard'
import { recordEventImportChoices } from './endpoints/choices'
import { commitEventImport } from './endpoints/commit'
import { proposeEventImport } from './endpoints/propose'
import { resolveEventImport } from './endpoints/resolve'
import { reviewEventImport } from './endpoints/review'
import { eventImportTemplate } from './endpoints/template'
import { editEventImportTree } from './endpoints/tree'
import { uploadEventImport } from './endpoints/upload'

/** Where a proposed node is created, shared by the node and its pre-`map` copy. */
const nodeLocation = z
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

/**
 * Staging for one bulk event import, from upload to commit.
 *
 * A batch is working state, not a record: **the commit's finish reduces it to its
 * report and trashes it** (`commit/finish.ts`), and the trash window erases it.
 * What survives is on the events themselves — each one's `activityLog` names the
 * manager who imported it, and its `importKey` the batch and line — so a
 * provenance question is answered from the event rather than from a row somebody
 * has to keep. A batch nobody finishes or discards is swept after
 * `ABANDONED_BATCH_DAYS` (`PurgeEventImports`).
 *
 * Reached only through the Import tab on a region, which also lists a
 * volunteer's unfinished batches; hidden from the nav for everyone but admins.
 * No project lists it, so it is named in `RESTRICTED_COLLECTIONS`
 * (`src/plugins/access/config/projects.ts`) — "no project" otherwise reads as
 * *shared*, and every published API key, the Atlas widget's browser key
 * included, would read every uploaded CSV.
 *
 * ⚠ **One request at a time per batch, several batches per region.** Each
 * writing endpoint holds the batch's lease (`lease.ts`). Two volunteers
 * uploading the same region's classes is a duplicate-detection problem, so the
 * commit re-runs the duplicate check against the classes added since the review
 * and re-checks every slug and region the tree names, rather than trusting what
 * the review step saw.
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
    reviewEventImport,
    editEventImportTree,
    recordEventImportChoices,
    commitEventImport,
  ],
  // `create` is left to the generated config on purpose — it already answers
  // "admins only" (`access.ts`). `delete` is overridden because a discard is a
  // trash attempt, which runs that check too.
  access: {
    read: batchUploaderAccess,
    update: batchUploaderAccess,
    delete: batchDiscardAccess,
  },
  hooks: {
    // The discard's timestamp decides when the retention window runs out, so it
    // is not the caller's to choose (`discard.ts`).
    beforeChange: [guardBatchUpdate],
  },
  admin: {
    group: 'Classes',
    defaultColumns: ['id', 'targetRegion', 'uploader', 'status', 'updatedAt'],
    // Admins only: a volunteer reaches their batches from the region's Import
    // tab, and an admin needs this list to restore a discarded batch or look at
    // a stalled one.
    hidden: ({ user }) => !isAdminManager(user as Manager | null),
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
        { label: 'Finished', value: 'finished' },
      ],
      admin: {
        description:
          'Written by the import endpoints. `committing` means a commit was interrupted part-way; its rows carry the ids of whatever was already created. `finished` is the trashed report a finished commit leaves behind.',
      },
    },
    {
      // ⚠ **The locale the role was granted in, kept so every later step can
      // ask again.** `roles` is localized (#701), and the role is re-checked on
      // every call — a manager whose `atlas-manager` grant was revoked after the
      // upload must not go on to commit (`capability.ts`).
      name: 'uploadLocale',
      type: 'text',
      access: { update: adminOnlyFieldAccess },
      admin: { readOnly: true },
    },
    {
      // Written by `POST /:id/choices`, the reviewer's opt-in. Off by default:
      // an import emails nobody unless the reviewer asked for it.
      name: 'inviteCoordinators',
      type: 'checkbox',
      defaultValue: false,
      access: { update: adminOnlyFieldAccess },
      admin: { readOnly: true },
    },
    {
      // ⚠ **The one-request-at-a-time lease (`lease.ts`).** Claimed with a
      // conditional UPDATE, so two resolve or commit calls on one batch cannot
      // both work it — the race that created every class twice.
      name: 'leaseToken',
      type: 'text',
      access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess },
      admin: { hidden: true },
    },
    {
      name: 'leaseUntil',
      type: 'date',
      access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess },
      admin: { hidden: true },
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
      // Taken at upload only: every later step trusts it, and the resolve step
      // writes it onto rows as their languages.
      access: { update: adminOnlyFieldAccess },
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
            .describe(
              'The row as the CSV held it, keyed by column name and trimmed — save a bare-host `website` or `onlineUrl`, stored with `https://` added (`csv/fieldChecks.ts`).',
            ),
          errors: z
            .array(z.string())
            .optional()
            .describe(
              'Everything wrong with the row, from the parse, the resolve, the proposal and the commit alike. A row with any of these is skipped, never committed.',
            ),
          warnings: z
            .array(z.string())
            .optional()
            .describe(
              'Things a reviewer should know that do not stop the row: a geocode that only reached the town, a coordinator the import will not link.',
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
              regionMapboxId: z
                .string()
                .nullable()
                .optional()
                .describe(
                  "The Mapbox `region` (state) feature the address sits in, which a proposed state matches an existing region on.",
                ),
              approximate: z
                .boolean()
                .optional()
                .describe(
                  'The geocode reached only the street or the town, not the address — so the point is not a hall, and the nearby-address duplicate rule ignores it.',
                ),
              weekdayMask: z
                .int()
                .describe(
                  'The occurrence weekdays as a 7-bit mask, Monday the low bit. Derived once so a row stays comparable across chunks.',
                ),
              startMinutes: z
                .int()
                .nullable()
                .describe("Minutes since midnight on the class's own clock."),
              firstDay: z
                .int()
                .optional()
                .describe('The first occurrence as a local day number, for the duplicate check.'),
              lastDay: z
                .int()
                .nullable()
                .optional()
                .describe('The last occurrence as a local day number, or null for an open series.'),
              monthWeeks: z
                .int()
                .optional()
                .describe("A monthly-by-weekday class's week numbers as a mask, 0 otherwise."),
              monthDay: z
                .int()
                .nullable()
                .optional()
                .describe("A monthly-by-date class's day of the month, null otherwise."),
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
              strength: z
                .enum(['strong', 'weak'])
                .optional()
                .describe(
                  '`strong` is the same hall at the same time; `weak` is the same town and time, which the review badges "possible duplicate".',
                ),
              eventId: z.int().optional().describe('The existing class this row repeats.'),
              line: z
                .int()
                .optional()
                .describe('The earlier line in this same file the row repeats.'),
              action: z
                .enum(['skip', 'import', 'overwrite'])
                .optional()
                .describe(
                  "The reviewer's choice, `skip` when absent. `overwrite` replaces the matched class's values with the row's filled columns, and is only offered against an existing class.",
                ),
              atCommit: z
                .boolean()
                .optional()
                .describe(
                  'Found by the commit, against a class added after the review — skipped, because nobody chose otherwise.',
                ),
            })
            .optional()
            .describe('A matched row, and what the reviewer chose to do about it.'),
          failedAttempts: z
            .int()
            .optional()
            .describe(
              'Commit attempts this row failed for a reason that was not its own, so one that keeps failing is eventually reported instead of stalling the commit.',
            ),
          committed: z
            .strictObject({
              eventId: z.int().describe('The class this row created or overwrote.'),
              action: z
                .enum(['created', 'overwrote'])
                .optional()
                .describe('`created` when absent.'),
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
      // ⚠ **Closed, unlike the guidance's default for a JSON column.** Two
      // endpoints write it and both rewrite it whole — `propose` from the rows,
      // `tree` from a reviewer's edits — so no row can be stranded by a shape
      // change, and a review that renames a node has to fail loudly rather than
      // save a tree the commit then walks past.
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
            location: nodeLocation.describe('Null for every node the commit does not create.'),
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
            before: z
              .strictObject({
                name: z.string(),
                parentKey: z.string().nullable(),
                location: nodeLocation,
              })
              .optional()
              .describe(
                'What a `map` edit replaced, so an `unmap` can put the proposal back exactly.',
              ),
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
    jsonField({
      name: 'report',
      schemaTitle: 'EventImportReport',
      // ⚠ **What a finished commit leaves behind, and the reason a lost final
      // response is not a lost report.** The finish trashes the batch with its
      // CSV values stripped from every row it committed, so the trash window
      // (`PurgeEventImports`) bounds how long the rest is kept — and a commit
      // call that finds `finished` answers with this instead of a 404.
      access: { update: adminOnlyFieldAccess },
      schema: z.strictObject({
        committed: z.array(
          z.strictObject({
            line: z.int(),
            eventId: z.int(),
            action: z.enum(['created', 'overwrote']),
          }),
        ),
        skipped: z.array(
          z.strictObject({
            line: z.int(),
            reasons: z.array(z.string()),
            values: z
              .record(z.string(), z.string())
              .describe('The row as uploaded, so the volunteer can download, fix and re-upload it.'),
          }),
        ),
        reportEmailed: z
          .boolean()
          .describe('Whether the uploader was emailed this report, with the skipped lines attached.'),
        finishedAt: z.string(),
      }),
      admin: { readOnly: true },
    }),
  ],
}
