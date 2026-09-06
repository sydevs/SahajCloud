/**
 * @deprecated Workaround component for virtual join fields — will be removed
 * when PayloadCMS fixes the docWithFilenameExists locale bug and we can use
 * native join fields instead. See https://github.com/sydevs/SahajCloud/issues/249
 */
'use client'

import type { JSONFieldClientComponent } from 'payload'

import { FieldLabel, useDocumentDrawer, useField } from '@payloadcms/ui'
import Link from 'next/link'
import { useCallback } from 'react'

import type { TagAssignments } from '@/payload-types'

import { ExternalLinkIcon } from './ExternalLinkIcon'

/** One row of the virtual join column, straight off the generated type. */
type TagAssignment = TagAssignments[number]

/**
 * Individual tag pill that opens a document drawer on click.
 * Extracted as a separate component because useDocumentDrawer is a hook
 * and cannot be called inside a loop.
 */
const TagPill: React.FC<{ tag: TagAssignment }> = ({ tag }) => {
  const [DocumentDrawer, , { openDrawer }] = useDocumentDrawer({
    collectionSlug: 'user-choices',
    id: tag.id,
  })

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      openDrawer()
    },
    [openDrawer],
  )

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: 'calc(var(--base) * 0.15) calc(var(--base) * 0.5)',
          backgroundColor: 'var(--theme-elevation-100)',
          borderRadius: 'var(--style-radius-s)',
          color: 'var(--theme-text)',
          fontSize: 'calc(var(--base-body-size) * 1px)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {tag.title}
        <ExternalLinkIcon style={{ marginLeft: '4px', opacity: 0.5 }} />
      </button>
      <DocumentDrawer />
    </>
  )
}

export const TagAssignmentField: JSONFieldClientComponent = ({ field }) => {
  const { name, label } = field
  const { value } = useField<TagAssignment[]>()

  const tags = Array.isArray(value) ? value : []

  return (
    <div className="field-type json" style={{ marginBottom: 'calc(var(--base) * 1.25)' }}>
      <FieldLabel label={label} path={name} />

      <div style={{ marginTop: 'calc(var(--base) * 0.25)' }}>
        {tags.length === 0 ? (
          <span style={{ color: 'var(--theme-elevation-400)' }}>
            None assigned —{' '}
            <Link
              href="/admin/collections/user-choices"
              target="_blank"
              style={{ color: 'var(--theme-elevation-500)', textDecoration: 'underline' }}
            >
              manage categories
            </Link>
          </span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--base) * 0.3)' }}>
            {tags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TagAssignmentField
