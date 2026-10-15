'use client'

import type { DefaultCellComponentProps } from 'payload'

import Link from 'next/link'

import { CellButton, useDrawerRowSelect } from '@/components/admin/drawerRowSelect'

type RelationshipCountLinkProps = Partial<
  Pick<DefaultCellComponentProps, 'className' | 'collectionSlug' | 'link' | 'rowData'>
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
  className,
  collectionSlug,
  count,
  href,
  label,
  link,
  rowData,
}) => {
  const handleClick = useDrawerRowSelect({ collectionSlug, link, rowData })
  const text = `${count} ${label}`

  if (handleClick) {
    return (
      <CellButton className={className} onClick={handleClick}>
        {text}
      </CellButton>
    )
  }

  if (href) {
    return (
      <Link href={href} title={`View ${text}`}>
        {text}
      </Link>
    )
  }

  if (count === 0) {
    return <span style={{ color: 'var(--theme-elevation-400)' }}>{text}</span>
  }

  return <span>{text}</span>
}
