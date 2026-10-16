'use client'

import type { CollectionSlug, DefaultCellComponentProps } from 'payload'

import { useListDrawerContext } from '@payloadcms/ui'

type DrawerRowSelectArgs = Partial<
  Pick<DefaultCellComponentProps, 'collectionSlug' | 'link' | 'rowData'>
>

/**
 * The click a custom `Cell` owes a list drawer.
 *
 * Payload wires a drawer's select handler into `propsToPass.onClick` inside
 * `RenderDefaultCell`, which a custom `Cell` replaces, and hands that cell an
 * `onClick` key it never fills — so the cell has to read the drawer itself
 * (#942, #944). `link` stands for "this is the linked column", as it is
 * `isLinkedColumn` everywhere `admin.formatDocURL` is unset.
 *
 * The two seams that look like they would spare a cell this both end inside
 * the component it replaced: `useCellProps()` answers `null`, because
 * `CellPropsContext` is provided only in `RenderDefaultCell`, and
 * `LinkedCellOverride` is settable only from `RelationshipTable`.
 *
 * This convention is a workaround for a Payload defect that is unreported
 * upstream, so it has no end date yet. #964 holds that report.
 *
 * Returns `undefined` when the cell should render whatever it renders outside
 * a drawer.
 */
function useDrawerRowSelect({
  collectionSlug,
  link,
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

  return undefined
}

/**
 * Not `@payloadcms/ui`'s `Button`, which wraps its children in two spans —
 * breaking a cell's own layout — and whose `.btn` rule sets
 * `pointer-events: none` on every descendant.
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

/**
 * Every custom `Cell` renders through this, so the drawer rule has one home
 * rather than a copy per cell (#944).
 *
 * `children` is what a selected row shows inside the button. `fallback` is
 * what renders instead when no click applies — a cell's own link, which must
 * never end up inside the button. Taking it as an element rather than
 * rendering it is what keeps that true: only one of the two is ever mounted.
 *
 * `onClick` is the cell's own click, taken only outside a drawer's linked
 * column. It is not Payload's `onClick`, which `renderCell` never fills.
 */
export const SelectableCell: React.FC<
  DrawerRowSelectArgs & {
    children: React.ReactNode
    fallback?: React.ReactNode
    onClick?: () => void
  }
> = ({ children, collectionSlug, fallback, link, onClick, rowData }) => {
  const handleClick = useDrawerRowSelect({ collectionSlug, link, rowData }) ?? onClick

  if (handleClick) {
    return (
      <button type="button" onClick={handleClick} style={CELL_BUTTON_STYLE}>
        {children}
      </button>
    )
  }

  return <>{fallback ?? children}</>
}
