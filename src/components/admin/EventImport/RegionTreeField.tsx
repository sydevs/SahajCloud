import type { JSONFieldServerComponent } from 'payload'

import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import type { ProposedTree } from '@/collections/EventImports/propose/tree'
import { readExistingRegions, targetSubtreeWhere } from '@/collections/EventImports/regionReads'
import { relationId } from '@/lib/utilities/relationId'
import type { Region } from '@/payload-types'

import { RegionTree } from './RegionTree'

/** The one stage whose controls need anything read at all. */
const REVIEW_STAGE = 'review'

/**
 * The one read the region tree needs, done where reads belong.
 *
 * A server component rather than an endpoint: "which regions may this node be
 * mapped onto" is a tree read, and `docs/rules/admin-ui.md` has this repo doing
 * those with direct Payload access. #874 answered the same question from a
 * custom endpoint the browser called on every edit.
 *
 * ⚠ **Nothing is read outside `review`.** `mappable` and `targetName` feed only
 * the rename and map controls, which the client renders only while the batch is
 * the reviewer's — and a batch spends the rest of its life finished. Reading
 * them anyway would put every city in a country into the flight payload of a
 * page that cannot offer a single control.
 *
 * ⚠ **The target is read for its name, not through `loadTarget`.** That helper
 * walks the ancestor chain in a second query to resolve the scope, and this
 * caller discards the scope and the warning both.
 */
export const RegionTreeField: JSONFieldServerComponent = async ({
  clientField,
  data,
  path,
  req,
}) => {
  const tree = data?.proposedRegions as ProposedTree | null | undefined
  const targetId = relationId(data?.targetRegion)
  const nodes = tree?.nodes ?? []
  const editable = nodes.length > 0 && targetId !== null && data?.status === REVIEW_STAGE

  let mappable: ExistingRegion[] = []
  let targetName = ''

  if (editable && targetId !== null) {
    const levels = [...new Set(nodes.map((node) => node.level))]
    const [target, inSubtree] = await Promise.all([
      req.payload.findByID({
        collection: 'regions',
        id: targetId,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        // `name` is optional on the collection and the slug disambiguator reads
        // this, so the required `slug` is the fallback.
        select: { name: true, slug: true },
        req,
      }) as Promise<Region | null>,
      readExistingRegions(
        req,
        { and: [targetSubtreeWhere(targetId), { level: { in: levels } }] },
        true,
      ),
    ])
    mappable = inSubtree
    // A target deleted since the upload leaves the tree readable and every edit
    // refused by `applyTreeEdits`, which is the honest outcome: the batch has
    // nowhere to commit to either.
    targetName = target ? target.name?.trim() || target.slug : ''
  }

  return (
    <RegionTree
      description={clientField.admin?.description}
      label={clientField.label}
      mappable={mappable}
      path={path}
      targetName={targetName}
    />
  )
}

export default RegionTreeField
