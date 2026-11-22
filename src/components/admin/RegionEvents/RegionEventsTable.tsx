'use client'

import type { JoinFieldClient, Where } from 'payload'

import { RelationshipTable } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import { fieldId } from '@/components/admin/helpers/fieldId'
import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'

import { ImportClassesLabel } from '../EventImport/ImportClassesLabel'

/**
 * Payload's own join table, pointed at a region subtree instead of at one
 * `region` value.
 *
 * `RelationshipTable` re-queries through `getTableState` under the reader's own
 * access, so `filterOptions` is a request for rows, never a grant of them; the
 * server-resolved join value is deliberately not seeded as `initialData`, since
 * it holds the narrower, direct-join answer.
 */
export function RegionEventsTable({
  allowCreate,
  field,
  path,
  regionId,
  regionIds,
}: {
  allowCreate: boolean
  field: JoinFieldClient
  path: string
  regionId: number
  regionIds: number[]
}) {
  const filterOptions = useMemo<Where>(() => ({ region: { in: regionIds } }), [regionIds])

  return (
    <div className="field-type join" id={fieldId(path)} style={mergeFieldStyles(field.admin)}>
      <RelationshipTable
        allowCreate={allowCreate}
        field={field}
        fieldPath={path}
        filterOptions={filterOptions}
        initialDrawerData={allowCreate ? { region: regionId } : undefined}
        Label={
          <h4 style={{ margin: 0 }}>
            <ImportClassesLabel field={field} path={path} />
          </h4>
        }
        parent={{ id: regionId, collectionSlug: 'regions', joinPath: path }}
        relationTo="events"
      />
    </div>
  )
}

export default RegionEventsTable
