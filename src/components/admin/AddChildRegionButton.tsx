'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

/**
 * "New <Level>" action for a recursive child-join tab on Regions.
 *
 * Those joins are `on: 'breadcrumbs.doc'` (all descendants), so Payload's native
 * "Add New" would seed `breadcrumbs.doc` (a no-op the nested-docs hook overwrites)
 * instead of `parent` — `allowCreate: false` hides it. This links to the regions
 * create page with `?parent=&childLevel=`, which `RegionCreatePrefill` reads to
 * seed `parent` + `level` — the same mechanism the Atlas sidebar's "+" buttons use.
 *
 * `childLevel` + `levelLabel` come from the field's `admin.custom` (set per tab in
 * Regions.ts), so one component serves all three levels.
 */
export const AddChildRegionButton: UIFieldClientComponent = ({ field }) => {
  const { id } = useDocumentInfo()
  const custom = field?.admin?.custom as { childLevel?: string; levelLabel?: string } | undefined
  const childLevel = custom?.childLevel

  // No parent id until the doc is saved; the tab only shows post-create, but guard anyway.
  if (!id || !childLevel) return null

  const href = `/admin/collections/regions/create?parent=${id}&childLevel=${childLevel}`

  return (
    // Payload's Button has no `style` prop, so position via a wrapper (per the
    // admin-ui rule). Absolute + no margin lifts the action out of flow so the
    // descendant table can sit flush at the top of the tab.
    <div style={{ position: 'absolute' }}>
      <Button
        buttonStyle="secondary"
        el="link"
        icon={['plus']}
        iconPosition="left"
        margin={false}
        size="small"
        to={href}
      >
        {`New ${custom?.levelLabel ?? 'child'}`}
      </Button>
    </div>
  )
}

export default AddChildRegionButton
