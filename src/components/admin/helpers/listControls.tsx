'use client'

import type { PaginatedDocs } from 'payload'
import type { ReactNode } from 'react'

import { Button, Pagination, PerPage } from '@payloadcms/ui'

import styles from './listControls.module.css'
import { useSetQuery } from './useSetQuery'

type ListQuery = { filter: string; limit: number; page: number }

/**
 * A URL-driven view's filter row, in Payload's document-tab markup — the
 * header's Edit / Versions row — so it needs no stylesheet of its own.
 * `children` sit at the row's far end.
 */
export function FilterTabs({
  active,
  children,
  controls,
  label,
  tabs,
}: {
  active: string
  children?: ReactNode
  /** The id of the list the filters narrow. */
  controls: string
  label: string
  tabs: { count: number; label: string; value: string }[]
}) {
  const setQuery = useSetQuery<ListQuery>()
  return (
    <div className={styles.toolbar}>
      <div aria-label={label} className="doc-tabs__tabs" role="group">
        {tabs.map((tab) => (
          <Button
            buttonStyle="tab"
            className={tab.value === active ? 'doc-tab doc-tab--active' : 'doc-tab'}
            disabled={tab.value === active}
            extraButtonProps={{ 'aria-controls': controls, 'aria-pressed': tab.value === active }}
            key={tab.value}
            margin={false}
            onClick={() => setQuery({ filter: tab.value, page: 1 })}
            size="medium"
          >
            <span className="doc-tab__label">
              {tab.label}
              <span className="pill-version-count">{tab.count}</span>
            </span>
          </Button>
        ))}
      </div>
      {children}
    </div>
  )
}

/**
 * Payload's `Pagination`, writing the page to the URL. With `limits` it adds
 * `PerPage`, once there is more than the smallest page to show.
 */
export function QueryPager({ docs, limits }: { docs: PaginatedDocs<unknown>; limits?: number[] }) {
  const setQuery = useSetQuery<ListQuery>()
  const pagination = (
    <Pagination
      hasNextPage={docs.hasNextPage}
      hasPrevPage={docs.hasPrevPage}
      nextPage={docs.nextPage ?? undefined}
      onChange={(page) => setQuery({ page })}
      page={docs.page}
      prevPage={docs.prevPage ?? undefined}
      totalPages={docs.totalPages}
    />
  )
  if (!limits) return pagination
  return (
    <div className={styles.pageControls}>
      {pagination}
      {docs.totalDocs > limits[0]! && (
        <PerPage
          handleChange={(limit) => setQuery({ limit, page: 1 })}
          limit={docs.limit}
          limits={limits}
        />
      )}
    </div>
  )
}
