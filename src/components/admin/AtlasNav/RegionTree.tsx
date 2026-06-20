import React from 'react'

import type { RegionTreeNode as RegionTreeNodeData } from '@/lib/atlasSidebar/sidebarModel'

import { RegionTreeNode } from './RegionTreeNode'
import { SectionLabel } from './SectionLabel'

function renderNode(node: RegionTreeNodeData, depth: number): React.ReactNode {
  return (
    <RegionTreeNode
      counts={node.counts}
      depth={depth}
      hasChildren={node.children.length > 0}
      id={node.id}
      key={node.id}
      name={node.name}
    >
      {node.children.map((child) => renderNode(child, depth + 1))}
    </RegionTreeNode>
  )
}

/**
 * The manager's owned regions + descendants as a collapsible nested tree,
 * hidden entirely when they manage no regions.
 */
export function RegionTree({ regions }: { regions: RegionTreeNodeData[] }) {
  if (!regions.length) return null
  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <SectionLabel>Regions</SectionLabel>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {regions.map((node) => renderNode(node, 0))}
      </ul>
    </div>
  )
}
