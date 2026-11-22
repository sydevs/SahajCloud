/**
 * Every registered custom `Cell` renders through `SelectableCell` (#944).
 *
 * The component is a convention, and `custom-cell-drawer-select.spec.ts` names
 * the three cells that hold it today — so a sixth custom cell added next month
 * is green and broken in exactly the way #942 and #944 were. This walks the
 * registrations instead, the shape `lib-boundary.spec.ts` and
 * `status-config-sync.spec.ts` already use.
 *
 * A cell that genuinely must never select is a deliberate edit here, not an
 * omission nobody notices.
 */
import { relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { reaches, registeredComponents, SRC } from '../utils/adminRegistrations'

/** Anchored: a substring match calls `SelectableCellX` a hit. */
const CONVENTION = /\bSelectableCell\b/

describe('every registered custom Cell handles list-drawer selection', () => {
  const cells = registeredComponents('Cell')

  it('resolves every registration it found', () => {
    // A specifier resolving nowhere would leave the population silently, which
    // the pinned list below cannot show — it is the population (#1247).
    expect(cells.unresolved).toEqual([])
  })

  /** A scan finding nothing would make the assertion below pass by vacuum. */
  it('finds the registrations', () => {
    expect(cells.resolved.map((path) => relative(SRC, path))).toEqual([
      'components/admin/AbuseScore/AbuseScoreCell.tsx',
      'components/admin/ColorField/ColorCell.tsx',
      'components/admin/RelationshipCountCell/index.ts',
      'components/admin/ThumbnailCell/PreviewUrlThumbnailCell.tsx',
      'components/admin/ThumbnailCell/RelationshipThumbnailCell.tsx',
    ])
  })

  it('reaches SelectableCell from each one', () => {
    expect(
      cells.resolved
        .filter((cell) => !reaches(CONVENTION, cell))
        .map((path) => relative(SRC, path)),
    ).toEqual([])
  })
})
