/**
 * The Import tab, declared by the feature it belongs to and spread into
 * `Regions.tabs`.
 *
 * ⚠ **Here rather than in `Regions.ts`, so one owner holds the whole surface.**
 * Which levels may be a target, which field the join reads, and what the tab
 * tells a volunteer are all this feature's answers — stating them inside Regions
 * would put half of `event-imports` in a file that knows nothing else about it.
 * Regions imports one object (`src/AGENTS.md`, the exception path in
 * "Organization rules").
 */

import type { Tab } from 'payload'

import { hideUntilCreated } from '@/fields'
import type { Region } from '@/payload-types'

import { isProposableTargetLevel } from './propose/tree'

/**
 * ⚠ **The same levels `targetRegion` accepts, from the same predicate.** A venue
 * has no tab because a batch cannot target one — the proposal has nothing left to
 * propose beneath it (`propose/tree.ts`) — and a tab whose create form its own
 * validator then refuses reads as broken rather than as scoped.
 */
const visible = (data: Record<string, unknown>): boolean =>
  hideUntilCreated(data) && isProposableTargetLevel(data?.level as Region['level'])

/**
 * This region's batches, and the way a volunteer starts one.
 *
 * `event-imports` is admin-hidden, so its own list and routes are closed to a
 * volunteer — a `join` renders the rows and opens each in a document drawer,
 * which never touches the route (`docs/rules/admin-ui.md`, "A hidden collection
 * is still reachable through a `join`").
 */
export const REGION_IMPORT_TAB: Tab = {
  label: 'Import',
  admin: { condition: visible },
  fields: [
    {
      name: 'imports',
      type: 'join',
      collection: 'event-imports',
      on: 'targetRegion',
      admin: {
        defaultColumns: ['filename', 'status', 'manager', 'updatedAt'],
        // ⚠ **Unlike the child-level tabs, the native button is right.** Those
        // join on `breadcrumbs.doc`, which "Add new" would seed and which the
        // create form has no use for — hence `AddChildRegionButton`. Here `on`
        // is `targetRegion`, the one field the create form wants prefilled, so
        // Payload's own `initialData` does the whole job.
        allowCreate: true,
        description:
          'Import classes into this region from a CSV. Start from the template at /event-import-template.csv.',
      },
    },
  ],
}
