import { NavGroup } from '@payloadcms/ui'
import React from 'react'

import type { RegionTreeNode as RegionTreeNodeData } from '@/lib/atlasSidebar/sidebarModel'

import { RegionTreeNode } from './RegionTreeNode'

/** Self + descendant ids — lets a node auto-expand when the open region is inside it. */
function collectSubtreeIds(node: RegionTreeNodeData): number[] {
  return [node.id, ...node.children.flatMap(collectSubtreeIds)]
}

function renderNode(node: RegionTreeNodeData, depth: number): React.ReactNode {
  return (
    <RegionTreeNode
      counts={node.counts}
      depth={depth}
      hasChildren={node.children.length > 0}
      id={node.id}
      key={node.id}
      name={node.name}
      subtreeIds={collectSubtreeIds(node)}
    >
      {node.children.map((child) => renderNode(child, depth + 1))}
    </RegionTreeNode>
  )
}

/**
 * The manager's owned regions + descendants as a collapsible nested tree under a
 * nav group matching the default nav. Hidden when they manage no regions.
 */
export function RegionTree({ regions }: { regions: RegionTreeNodeData[] }) {
  if (!regions.length) return null
  return <NavGroup label="Regions">{regions.map((node) => renderNode(node, 0))}</NavGroup>
}
