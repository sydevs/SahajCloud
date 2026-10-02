'use client'

import { Button, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { usePathname, useSearchParams } from 'next/navigation'

import { importTabTarget } from './tabTarget'

export interface ImportTabLinkProps {
  /** The view's `path`, exactly as Payload hands it to a tab component. */
  readonly path: string
  /** The levels a batch may target, passed down rather than imported. */
  readonly levels: readonly string[]
  readonly label: string
}

/**
 * The Import tab's link, which hides itself on a region no batch can target.
 *
 * ⚠ **This exists because `tab.condition` is handed no document.** Payload calls
 * it with `{ collectionConfig, config, globalConfig, permissions, req }` and
 * wants a synchronous boolean, so the level of the region being edited is not
 * knowable there — and `venue` is a level the import refuses. The condition
 * answers the capability half (`mayStageImport`); this answers the per-document
 * half from `useDocumentInfo()`, where the level already is.
 *
 * ⚠ **The levels arrive as a prop.** `PROPOSABLE_TARGET_LEVELS` sits beside the
 * proposal engine, and importing it here would pull that whole module graph into
 * the admin bundle. The server half passes the list, so there is still one list.
 *
 * ⚠ **Only the subtree question is missing, and read access already answers it.**
 * A manager cannot open a region outside their owned subtree at all, so a tab on
 * a region they are reading is a tab on a region they manage. `ImportView`
 * re-checks it regardless — a typed URL reaches the view with no tab involved.
 *
 * Payload's own `DefaultDocumentTab` is internal to `@payloadcms/next`, so the
 * markup below reproduces what it renders: a `tab`-styled `Button` carrying the
 * `doc-tab` classes Payload's stylesheet already defines.
 */
export const ImportTabLink = ({ label, levels, path }: ImportTabLinkProps) => {
  const { id, collectionSlug, data } = useDocumentInfo()
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const pathname = usePathname()
  const locale = useSearchParams().get('locale')

  const target = importTabTarget({
    adminRoute,
    collectionSlug,
    id,
    level: typeof data?.level === 'string' ? data.level : null,
    levels,
    locale,
    path,
  })
  if (!target) return null

  const isActive = pathname === target.href

  return (
    <Button
      aria-label={label}
      buttonStyle="tab"
      className={['doc-tab', isActive && 'doc-tab--active'].filter(Boolean).join(' ')}
      disabled={isActive}
      el={isActive ? 'div' : 'link'}
      margin={false}
      size="medium"
      to={isActive ? undefined : target.hrefWithLocale}
    >
      <span className="doc-tab__label">{label}</span>
    </Button>
  )
}
