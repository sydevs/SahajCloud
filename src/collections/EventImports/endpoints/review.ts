import type { CommitRow } from '../commit/rows'
import type { ExistingRegion } from '../propose/match'
import type { ProposedTree } from '../propose/tree'
import type { Endpoint } from 'payload'

import { requireActiveManager } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImport } from '@/payload-types'

import {
  batchIdOf,
  failure,
  loadTarget,
  readExistingRegions,
  refuseUnownedTarget,
  targetSubtreeWhere,
} from '../batchRequest'
import { managersByEmail } from '../commit/coordinators'
import { tallyTree } from '../propose/tree'
import { mappableRegions, reviewEmails, reviewRows } from '../review/rows'

/**
 * GET /api/event-imports/:id/review
 *
 * Everything the review surface renders, in one answer: the tree a reviewer
 * edits, the rows reduced to what the table shows, the regions a node may be
 * mapped onto, and how many coordinator accounts the commit would open.
 *
 * ⚠ **Not `GET /api/event-imports/:id`, which the uploader can already read.**
 * Two of the four are not on the document at all. The mappable regions come from
 * the target's subtree, which is server knowledge (`targetSubtreeWhere`) and
 * which a manager holds no `read` on above their own grant; and whether an
 * address already has an account is a `managers` read on `email`, a column locked
 * to admins and the holder (`src/collections/Managers/access.ts`). A client
 * assembling this itself would need both, and the second as a filter on a column
 * it cannot read.
 *
 * ⚠ **It answers a verdict, never an account.** No name, role, region or id of a
 * matched account reaches the body (#828), and the batch's own addresses do not
 * travel either — a row carries `existing` or `new` and nothing to pair it with.
 * That bit is about an address the caller supplied themselves, so it is not a
 * disclosure, but it is the line to hold: a field naming the account would
 * cross it, and no count-based assertion above would notice.
 *
 * ⚠ **Read-only, and that is what makes it safe to call on every edit.** The
 * review re-renders from this after each `POST /:id/tree`, so a write here would
 * be a second writer of a column two endpoints already share.
 *
 * ⚠ **The tree is the stored one, never rebuilt.** `propose` is its author and
 * `tree` its editor; recomputing here would show a reviewer a shape neither of
 * them wrote, and the next edit would then be applied to the stored one anyway.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel read by an authenticated `manager` of a batch
 * they uploaded, reached only from a region's Import tab. `managers` sits in no
 * project and publishes no paths, so this is absent from the OpenAPI client spec
 * for the same reason `setProject` is. Which batch the caller may touch comes
 * from the collection's own `access` (`access.ts`); the subtree check is re-run
 * explicitly because the region and manager reads below elevate past it.
 */
export const reviewEventImport: Endpoint = {
  path: '/:id/review',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = batchIdOf(req)
    if (id === null) return failure('A numeric batch id is required.', 400)

    const batch = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      select: { status: true, targetRegion: true, rows: true, proposedRegions: true },
      req,
    })) as EventImport | null
    if (!batch) return failure('No such import batch.', 404)

    const stored = batch.proposedRegions
    if (!stored) return failure('Propose the batch regions before reviewing them.', 409)

    const targetId = relationId(batch.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const loaded = await loadTarget(req, targetId)
    if (!loaded.ok) return failure(loaded.error, 422)

    const rows = (batch.rows ?? []) as CommitRow[]
    // ⚠ **The same subtree read the edit endpoint validates against**, so a
    // region the review offers cannot be one `POST /:id/tree` then refuses —
    // which would read as the mapping control being broken rather than as the
    // candidate having moved.
    const tree = stored as ProposedTree
    const [subtree, accounts] = await Promise.all([
      readExistingRegions(req, targetSubtreeWhere(targetId), true),
      managersByEmail(req, reviewEmails(rows)),
    ])

    // ⚠ **Only the keys.** `managersByEmail` answers with ids because the commit
    // is about to write classes against them; the review must learn that an
    // address is taken and nothing else about who holds it.
    const { rows: reviewed, coordinators } = reviewRows({
      rows,
      knownEmails: new Set(accounts.keys()),
      treeRowErrors: tree.rowErrors,
    })

    return Response.json({
      ...(loaded.warning ? { warning: loaded.warning } : {}),
      status: batch.status,
      target: { id: targetId, level: loaded.target.level, name: loaded.target.name },
      ...tallyTree(tree),
      proposedRegions: tree,
      mappable: mappableRegions(subtree, creatableLevels(tree)),
      rows: reviewed,
      coordinators,
    })
  },
}

/**
 * The levels a mapping may actually name, which are the levels of the nodes it
 * can be applied to.
 *
 * `applyTreeEdits` edits a `create` node and requires a candidate at its level
 * (`propose/edit.ts`), so a batch proposing only cities must not offer the
 * country above them.
 */
function creatableLevels(tree: ProposedTree): Set<ExistingRegion['level']> {
  return new Set(
    tree.nodes.filter((node) => node.match.kind === 'create').map((node) => node.level),
  )
}
