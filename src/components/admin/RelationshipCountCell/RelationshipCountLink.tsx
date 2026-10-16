'use client'

import type { DefaultCellComponentProps } from 'payload'

import Link from 'next/link'

import { SelectableCell } from '@/components/admin/drawerRowSelect'

type RelationshipCountLinkProps = Partial<
  Pick<DefaultCellComponentProps, 'collectionSlug' | 'link' | 'rowData'>
> & {
  count: number
  /** The filtered-list URL, or `null` where this cell shows no link. */
  href: string | null
  label: string
}

/**
 * The clickable half of `RelationshipCountCell`, split off so the count itself
 * stays a server cell with its `payload` prop (#944). Every prop here is
 * serializable for that reason.
 */
export const RelationshipCountLink: React.FC<RelationshipCountLinkProps> = ({
  collectionSlug,
  count,
  href,
  label,
  link,
  rowData,
}) => {
  const text = `${count} ${label}`

  return (
    <SelectableCell
      collectionSlug={collectionSlug}
      fallback={
        href ? (
          <Link href={href} title={`View ${text}`}>
            {text}
          </Link>
        ) : (
          <span style={count === 0 ? { color: 'var(--theme-elevation-400)' } : undefined}>
            {text}
          </span>
        )
      }
      link={link}
      rowData={rowData}
    >
      {text}
    </SelectableCell>
  )
}
