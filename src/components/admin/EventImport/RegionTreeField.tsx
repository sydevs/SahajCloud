import type { JSONFieldServerComponent } from 'payload'

import type { ProposedTree } from '@/collections/EventImports/propose/tree'
import { loadTarget, readExistingRegions, targetSubtreeWhere } from '@/collections/EventImports/regionReads'
import { relationId } from '@/lib/utilities/relationId'

import { RegionTree } from './RegionTree'

/**
 * The one read the region tree needs, done where reads belong.
 *
 * A server component rather than an endpoint: "which regions may this node be
 * mapped onto" is a tree read, and `docs/rules/admin-ui.md` has this repo doing
 * those with direct Payload access. #874 answered the same question from a
 * custom endpoint the browser called on every edit.
 *
 * ⚠ **Narrowed to the levels the proposal actually holds.** A country's subtree
 * is every city and venue under it, and the client only ever offers a node its
 * own level — so sending the rest would ship thousands of rows nothing can pick.
 */
export const RegionTreeField: JSONFieldServerComponent = async ({ clientField, data, path, req }) => {
  const tree = data?.proposedRegions as ProposedTree | null | undefined
  const targetId = relationId(data?.targetRegion)
  const nodes = tree?.nodes ?? []

  // Before the resolve job has run there is no tree to map anything onto, and
  // the create form has no target yet — the client renders its own empty note.
  if (!nodes.length || targetId === null) {
    return <RegionTree label={clientField.label} mappable={[]} path={path} targetName="" />
  }

  const loaded = await loadTarget(req, targetId)
  const levels = [...new Set(nodes.map((node) => node.level))]
  const mappable = await readExistingRegions(
    req,
    { and: [targetSubtreeWhere(targetId), { level: { in: levels } }] },
    true,
  )

  return (
    <RegionTree
      label={clientField.label}
      mappable={mappable}
      path={path}
      // A target that has since been deleted leaves the tree readable and every
      // edit refused by `applyTreeEdits`, which is the honest outcome: the batch
      // has nowhere to commit to either.
      targetName={loaded.ok ? loaded.target.name : ''}
    />
  )
}

export default RegionTreeField
