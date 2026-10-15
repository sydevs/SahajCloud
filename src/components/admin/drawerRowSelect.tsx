'use client'

import type { CollectionSlug, DefaultCellComponentProps } from 'payload'

import { useListDrawerContext } from '@payloadcms/ui'

type DrawerRowSelectArgs = Partial<
  Pick<DefaultCellComponentProps, 'cellData' | 'collectionSlug' | 'link' | 'onClick' | 'rowData'>
>

/**
 * The click a custom `Cell` owes a list drawer, and the one it owes its own
 * `onClick` prop, in Payload's own order.
 *
 * Payload wires a drawer's select handler into `propsToPass.onClick` inside
 * `RenderDefaultCell`, which a custom `Cell` replaces, and hands that cell the
 * unassigned `onClick` instead — so the cell has to read the drawer itself
 * (#942, #944). `link` stands for "this is the linked column", as it is
 * `isLinkedColumn` everywhere `admin.formatDocURL` is unset.
 *
 * The two seams that look like they would spare a cell this both end inside
 * the component it replaced: `useCellProps()` answers `null`, because
 * `CellPropsContext` is provided only in `RenderDefaultCell`, and
 * `LinkedCellOverride` is settable only from `RelationshipTable`.
 *
 * Returns `undefined` when the cell should render whatever it renders outside
 * a drawer.
 */
export function useDrawerRowSelect({
  cellData,
  collectionSlug,
  link,
  onClick,
  rowData,
}: DrawerRowSelectArgs): (() => void) | undefined {
  const { drawerSlug, onSelect } = useListDrawerContext()

  if (link && drawerSlug && rowData && typeof onSelect === 'function') {
    return () => {
      onSelect({
        collectionSlug: collectionSlug as CollectionSlug,
        doc: rowData,
        docID: String(rowData.id),
      })
    }
  }

  if (typeof onClick === 'function') {
    return () => {
      onClick({
        cellData,
        collectionSlug: collectionSlug as CollectionSlug,
        rowData: rowData ?? {},
      })
    }
  }

  return undefined
}

/**
 * A cell's clickable wrapper. Not `@payloadcms/ui`'s `Button`, which wraps its
 * children in two spans — breaking a cell's own layout — and whose `.btn` rule
 * sets `pointer-events: none` on every descendant.
 *
 * Inheriting the text properties is what keeps a selectable cell looking like
 * the cell it replaces: `renderCell` populates `className` for Payload's own
 * default cell only, so nothing else restores them here.
 */
const CELL_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  padding: 0,
  textAlign: 'left',
}

export const CellButton: React.FC<{
  children: React.ReactNode
  className?: string
  onClick: () => void
}> = ({ children, className, onClick }) => (
  <button type="button" className={className} onClick={onClick} style={CELL_BUTTON_STYLE}>
    {children}
  </button>
)
