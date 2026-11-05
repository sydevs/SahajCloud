import type { CollectionConfig, Where } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'
import { VERIFICATION_STAGES } from '@/lib/eventVerification/stages'
import { adminOnlyFieldAccess } from '@/plugins/access'
import type { PurgeWindow, RetentionConfig } from '@/types/retention'

/**
 * How long a day's counts are kept.
 *
 * ⚠ **Lower bound: the longest comparison a tile makes, plus slack.** The homes
 * and the statistics email both compare against the snapshot from 30 days ago,
 * so a window at 30 would race the sweep and show no change line on the days it
 * won. 45 leaves two weeks of missed runs before a comparison goes blind.
 */
export const SNAPSHOT_RETENTION_DAYS = 45

export const SNAPSHOT_WINDOWS: PurgeWindow[] = [
  {
    days: SNAPSHOT_RETENTION_DAYS,
    name: 'atlasSnapshots',
    where: (cutoff): Where => ({ date: { less_than: cutoff } }),
  },
]

/**
 * One UTC day's event counts, per region, per verification stage.
 *
 * ⚠ **Each region's OWN events, never its subtree's.** A subtree total cannot
 * be un-summed, so a stored rollup could not answer for a region whose parent
 * changed since — and the rollup is cheap anyway: `rollUpRegionCounts`
 * (`src/lib/atlasSidebar/sidebarModel.ts`) walks the same breadcrumbs the live
 * counts walk, over a map this size, in one pass.
 *
 * ⚠ **This is the whole history.** Nothing else records what the map looked
 * like yesterday: the stage lives on the event and is overwritten in place, and
 * `activityLog` records a reminder rather than a count. So a tile's "+12 in 30
 * days" has no other source, and a region absent from a row genuinely held no
 * events that day rather than not having been counted.
 */
export const AtlasSnapshots: CollectionConfig = {
  slug: 'atlas-snapshots',
  custom: { retention: { windows: SNAPSHOT_WINDOWS } satisfies RetentionConfig },
  admin: {
    // No nav entry and no routes: the rows are a job's working memory, read
    // only by the tiles that compare against them. A reader who wants the
    // numbers is looking at a home.
    hidden: true,
    useAsTitle: 'date',
    group: 'System',
  },
  access: {
    // Explicit, because "in no project" reads as shared (`docs/rules/access.md`)
    // and a region's event counts are not a published key's business.
    create: () => false,
    delete: () => false,
    read: ({ req }) => req.user?.collection === 'managers' && req.user.type === 'admin',
    update: () => false,
  },
  fields: [
    {
      name: 'date',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: adminOnlyFieldAccess },
      admin: { readOnly: true, description: 'The UTC day these counts were taken, as YYYY-MM-DD.' },
    },
    jsonField({
      name: 'counts',
      schemaTitle: 'AtlasSnapshotCounts',
      // ⚠ **Open keys at both levels, and the inner one is not a mistake.**
      // `z.record(z.enum(VERIFICATION_STAGES), …)` would be exhaustive — Zod
      // emits every member as `required`, so a day on which no listing was
      // `denied` fails validation. A region holds only the stages it has rows
      // for, and the stage names are documented rather than enumerated.
      schema: z.record(
        z.string().describe('A region id.'),
        z
          .record(z.string(), z.number())
          .describe(
            "Events in that region's own node, keyed by verification stage " +
              `(${VERIFICATION_STAGES.join(', ')}).`,
          ),
      ),
      admin: { readOnly: true },
    }),
  ],
}
