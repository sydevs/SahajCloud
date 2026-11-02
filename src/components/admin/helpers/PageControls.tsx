'use client'

import type { PaginatedDocs } from 'payload'

import { Pagination, PerPage } from '@payloadcms/ui'

import styles from './PageControls.module.css'

/** The paging fields of a `PaginatedDocs`, which is all this row reads. */
export type PageControlsDocs = Pick<
  PaginatedDocs<unknown>,
  'hasNextPage' | 'hasPrevPage' | 'nextPage' | 'page' | 'prevPage' | 'totalDocs' | 'totalPages'
>

/**
 * The pager under a list an admin view pages through, and the page-size
 * control beside it where the view offers one.
 *
 * It owns the two rules a caller would otherwise restate: `PaginatedDocs`
 * types the neighbouring pages nullable while `Pagination` takes neither
 * null, and a page size is worth offering only once the list outgrows the
 * smallest one. `Pagination` renders nothing on a single page by itself, so
 * this returns null only to keep an empty row out of its parent's gap.
 */
export function PageControls({
  docs,
  onPage,
  perPage,
}: {
  docs: PageControlsDocs
  onPage: (page: number) => void
  /** The page-size control. Omit it for a list with one page size. */
  perPage?: { limit: number; limits: number[]; onLimit: (limit: number) => void }
}) {
  const showPerPage = perPage !== undefined && docs.totalDocs > perPage.limits[0]
  if (!docs.hasPrevPage && !docs.hasNextPage && !showPerPage) return null
  return (
    <div className={styles.pageControls}>
      <Pagination
        hasNextPage={docs.hasNextPage}
        hasPrevPage={docs.hasPrevPage}
        nextPage={docs.nextPage ?? undefined}
        page={docs.page}
        prevPage={docs.prevPage ?? undefined}
        totalPages={docs.totalPages}
        onChange={onPage}
      />
      {showPerPage && (
        <PerPage limit={perPage.limit} limits={perPage.limits} handleChange={perPage.onLimit} />
      )}
    </div>
  )
}
