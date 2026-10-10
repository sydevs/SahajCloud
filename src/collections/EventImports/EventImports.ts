import type { CollectionConfig } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'
import { baseLanguage, getLanguageOptions } from '@/lib/locales'
import type { Manager } from '@/payload-types'
import { isAdminManager } from '@/plugins/access'

import { MAX_IMPORT_ROWS } from './constants'
import { parseUpload } from './hooks/parseUpload'
import { stampManager } from './hooks/stampManager'
import { validateTargetRegion } from './hooks/validateTargetRegion'
import { PROPOSABLE_TARGET_LEVELS } from './propose/tree'

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
 * One bulk event import, from the uploaded CSV to the classes it created.
 *
 * The uploaded file **is** the document: this is an upload collection, so
 * Payload's own create form is the upload UI and its `delete` removes the R2
 * object. Everything after the create is a `status` transition, and
 * `hooks/transitionStatus.ts` is the one place one may happen — the jobs do the
 * geocoding and the writes, and the edit form is the review surface.
 *
 * A volunteer never finds this in the nav. They reach a batch through the
 * **Import** tab on a region they manage, which is a `join` on `targetRegion`
 * (`docs/rules/admin-ui.md`, "A hidden collection is still reachable through a
 * `join`").
 *
 * ⚠ **No project lists it, so it is named in `RESTRICTED_COLLECTIONS`**
 * (`src/plugins/access/config/projects.ts`). "No project" otherwise reads as
 * *shared*, and every published API key — the Atlas widget's browser key
 * included — would read every uploaded CSV, contact details and all.
 *
 * ⚠ **There is no collection-level `access` block, on purpose.** The `manager`
 * field is what grants the uploader read and update on their own batches, through
 * the doc-manager path in `src/plugins/access/accessConfigs.ts`
 * (`getDocManagerFields` recognises the name). A collection-wide `read` grant
 * would show every volunteer every other region's CSV.
 */
export const EventImports: CollectionConfig = {
  slug: 'event-imports',
  labels: { singular: 'Event Import', plural: 'Event Imports' },
  upload: {
    // Excel on Windows labels a saved CSV `application/vnd.ms-excel`, and some
    // editors send `text/plain`. Refusing those is refusing the file a
    // volunteer actually has.
    mimeTypes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
    staticDir: 'media/event-imports',
  },
  hooks: {
    beforeChange: [stampManager, parseUpload],
  },
  admin: {
    group: 'Classes',
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'targetRegion', 'manager', 'status', 'updatedAt'],
    // Admins only: a volunteer reaches their batches from the region's Import
    // tab, and an admin needs this list to look at a stalled one.
    hidden: ({ user }) => !isAdminManager(user as Manager | null),
  },
  fields: [
    {
      // ⚠ **Not re-pointable after the create.** Every later step is computed
      // from it — the subtree the rows are confined to, and the uploader's own
      // access through the `join` — so a PATCH onto another region would move
      // the batch rather than edit it.
      name: 'targetRegion',
      type: 'relationship',
      relationTo: 'regions',
      required: true,
      maxDepth: 1,
      access: { update: () => false },
      filterOptions: { level: { in: [...PROPOSABLE_TARGET_LEVELS] } },
      validate: validateTargetRegion,
      admin: { description: 'The region these classes are imported into.' },
    },
    {
      // ⚠ **Named `manager`, not `uploader`.** `getDocManagerFields`
      // (`src/plugins/access/documentManagers.ts`) recognises that name, and
      // that recognition is the whole access story for this collection — see the
      // collection's own comment.
      name: 'manager',
      type: 'relationship',
      relationTo: 'managers',
      required: true,
      maxDepth: 1,
      access: { update: () => false },
      admin: { readOnly: true },
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
      access: { update: () => false },
      admin: {
        description: 'Language(s) to use for rows whose own `languages` column is empty.',
      },
    },
    {
      // ⚠ **Written by `transitionStatus` and the jobs, never by a form.** The
      // buttons submit a `status` override and that hook decides whether the
      // move is one this batch may make; `readOnly` keeps the select itself out
      // of the reviewer's way.
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'resolving',
      options: [
        { label: 'Resolving addresses', value: 'resolving' },
        { label: 'Ready for review', value: 'review' },
        { label: 'Creating classes', value: 'committing' },
        { label: 'Finished', value: 'finished' },
        { label: 'Failed', value: 'failed' },
        { label: 'Discarded', value: 'discarded' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'progress',
      type: 'group',
      admin: { readOnly: true },
      fields: [
        { name: 'done', type: 'number' },
        { name: 'total', type: 'number' },
        { name: 'note', type: 'text' },
      ],
    },
    jsonField({
      name: 'rows',
      schemaTitle: 'EventImportRows',
      // One row per CSV data row, in file order, carrying `parseImportCsv`'s
      // output (`csv/parse.ts`) verbatim. The resolve and commit steps widen
      // this shape as each lands; a key declared ahead of its writer generates a
      // type a consumer can read as available, and an Ajv rule nothing
      // exercises.
      //
      // The cap the parse step enforces, restated where the column is declared:
      // `parseUpload` is not the only writer once a job elevates past field
      // access, and `MAX_IMPORT_ROWS` is what bounds the geocoder spend.
      schema: z
        .array(
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
                  .describe('The Mapbox `place` id, which an existing city region matches on.'),
                mapboxId: z.string().nullable(),
                subdivisionCode: z.string().nullable(),
                regionMapboxId: z
                  .string()
                  .nullable()
                  .optional()
                  .describe(
                    'The Mapbox `region` (state) feature the address sits in, which a proposed state matches an existing region on.',
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
                    'The occurrence weekdays as a 7-bit mask, Monday the low bit. Derived once so a row stays comparable across passes.',
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
                  .describe(
                    'The last occurrence as a local day number, or null for an open series.',
                  ),
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
                  .enum(['skip', 'import'])
                  .optional()
                  .describe(
                    "The reviewer's choice, `skip` when absent. There is no overwrite: an import never modifies an existing class.",
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
            committed: z
              .strictObject({
                eventId: z.int().describe('The class this row created.'),
              })
              .optional()
              .describe(
                'Written as each row lands, so a retried commit resumes rather than creating a second class for every row before it.',
              ),
          }),
        )
        .max(MAX_IMPORT_ROWS),
    }),
    jsonField({
      name: 'proposedRegions',
      schemaTitle: 'EventImportProposedRegions',
      // The region tree the batch would create, as `buildProposedTree` returns
      // it (`propose/tree.ts`). Absent until the resolve job has run, which is
      // what the `review → committing` transition refuses on.
      //
      // ⚠ **Closed, unlike the guidance's default for a JSON column.** Two
      // writers produce it and both rewrite it whole — the resolve job from the
      // rows, `transitionStatus` from a reviewer's edits — so no row can be
      // stranded by a shape change, and a review that renames a node has to fail
      // loudly rather than save a tree the commit then walks past.
      schema: z.strictObject({
        nodes: z
          .array(
            z.strictObject({
              key: z
                .string()
                .describe('Stable across runs, so a review can address a node it renamed.'),
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
                .describe(
                  "The CSV lines this node's classes come from, the absorbed places' included.",
                ),
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
          )
          .describe('Parent-first, so the commit can create them in order.'),
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
    }),
    jsonField({
      name: 'report',
      schemaTitle: 'EventImportReport',
      // What a finished commit leaves behind. The summary email says the same
      // thing; this is what survives it, and what the skipped-rows download
      // reads.
      access: { update: () => false },
      schema: z.strictObject({
        committed: z.array(z.strictObject({ line: z.int(), eventId: z.int() })),
        skipped: z.array(
          z.strictObject({
            line: z.int(),
            reasons: z.array(z.string()),
            values: z
              .record(z.string(), z.string())
              .describe(
                'The row as uploaded, so the volunteer can download, fix and re-upload it.',
              ),
          }),
        ),
        finishedAt: z.string(),
      }),
      admin: { readOnly: true },
    }),
    {
      name: 'error',
      type: 'text',
      access: { update: () => false },
      admin: {
        readOnly: true,
        description: 'Why the last job gave up, for a batch that reads Failed.',
      },
    },
  ],
}
