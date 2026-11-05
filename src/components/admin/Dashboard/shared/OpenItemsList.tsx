'use client'

import { Banner, Button, CheckIcon, Pagination, PerPage, Pill, Table } from '@payloadcms/ui'
import Link from 'next/link'

import { OPEN_ITEM_FILTER_LABELS, OPEN_ITEM_FILTERS } from '@/lib/atlasOverview/filters'

import styles from './Dashboard.module.css'
import {
  type DashboardQuery,
  type OpenItemsData,
  type OpenItemsRow,
  PAGE_LIMITS,
  type OpenItemTab,
} from './model'
import { tableColumn } from '../../helpers/tableColumn'
import { useSetQuery } from '../../helpers/useSetQuery'

/** The filter row, in the order a reader meets the problems behind it. */
const FILTERS: { label: string; value: OpenItemTab }[] = [
  { label: 'All', value: 'all' },
  ...OPEN_ITEM_FILTERS.map((filter) => ({
    label: OPEN_ITEM_FILTER_LABELS[filter],
    value: filter as OpenItemTab,
  })),
  { label: 'Your programs', value: 'mine' },
]

/** The pill a status draws, or the tick for the one status that is not a problem. */
function StatusPill({ status }: { status: OpenItemsRow['statuses'][number] }) {
  if (status.pill === 'check') {
    return (
      <span className={styles.upToDate}>
        <CheckIcon />
        {status.label}
      </span>
    )
  }
  return (
    <Pill pillStyle={status.pill} size="small">
      {status.label}
    </Pill>
  )
}

/**
 * The open-items list every home opens on: filters, the rows, and paging.
 *
 * ⚠ **Every next step is a link to an edit view that already exists.** No
 * endpoint, action or hook is added for any of them: Verify works because a
 * manager's republish re-verifies (`Events/hooks/syncVerificationOnSave.ts`),
 * and the event page's own verification banner already asks for it.
 *
 * ⚠ **A filter with nothing in it is hidden**, not shown at zero. A reader
 * scanning four tabs for the one holding work is being asked to do the
 * counting the tabs exist to save them.
 */
export function OpenItemsList({
  data,
  emptyBanner,
  showMine,
}: {
  data: OpenItemsData
  /** The all-clear line, shown when nothing counts against progress. */
  emptyBanner: string
  /** Offer the "Your programs" filter — a region home only. */
  showMine?: boolean
}) {
  const setQuery = useSetQuery<DashboardQuery>()
  const { counts, query, rows } = data
  const docs = rows.docs

  // Derived here rather than taken as a prop: all three homes computed the same
  // expression, and each carried a branch that cannot fire — `progress` is
  // `null` for the admin alone, so their `?? counts.all` was the only arm ever
  // taken and the other two's `?? 0` never was.
  const open = data.progress?.open ?? counts.all

  const visible = FILTERS.filter((filter) => {
    if (filter.value === 'all') return true
    if (filter.value === 'mine') return Boolean(showMine) && counts.mine > 0
    return counts[filter.value] > 0 || query.filter === filter.value
  })

  return (
    <div className={styles.list} id="atlas-open-items">
      {/* All clear is about the counted rows, not the row count: a list of
          up-to-date programs is still worth showing under it. */}
      {open === 0 && <Banner type="success">{emptyBanner}</Banner>}
      {counts.all > 0 && (
        <>
          {visible.length > 1 && (
            <div aria-label="Filter open items" className={styles.filters} role="group">
              {visible.map((filter) => (
                <Button
                  buttonStyle={query.filter === filter.value ? 'subtle' : 'tab'}
                  extraButtonProps={{
                    'aria-controls': 'atlas-open-items',
                    'aria-pressed': query.filter === filter.value,
                  }}
                  key={filter.value}
                  margin={false}
                  onClick={() => setQuery({ filter: filter.value, page: 1 })}
                  size="medium"
                >
                  {filter.label}
                  <span className={styles.filterCount}>
                    {filter.value === 'all' ? counts.all : counts[filter.value]}
                  </span>
                </Button>
              ))}
            </div>
          )}
          <div aria-live="polite">
            <Table
              columns={[
                tableColumn(
                  'item',
                  'Item',
                  docs.map((row) => (
                    <div className={styles.itemInfo} key={row.id}>
                      <Link href={row.href} prefetch={false}>
                        {row.title}
                      </Link>
                    </div>
                  )),
                ),
                tableColumn(
                  'status',
                  'Status',
                  docs.map((row) => (
                    <div className={styles.statuses} key={row.id}>
                      {row.statuses.map((status) => (
                        <div className={styles.status} key={status.key}>
                          <StatusPill status={status} />
                          {status.line ? <p>{status.line}</p> : null}
                        </div>
                      ))}
                    </div>
                  )),
                ),
                tableColumn(
                  'action',
                  'Next step',
                  docs.map((row, index) =>
                    row.action ? (
                      <Button
                        aria-label={`${row.action.label}: ${row.title}`}
                        // The first row's step is the one to take now, so it is
                        // the only primary button on the page.
                        buttonStyle={index === 0 ? 'primary' : 'secondary'}
                        el="link"
                        key={row.id}
                        margin={false}
                        size="medium"
                        url={row.action.href}
                      >
                        {row.action.label}
                      </Button>
                    ) : null,
                  ),
                ),
              ]}
              // `Table` reads nothing off a row but `id` — every cell above is
              // pre-rendered — so it is handed the ids alone rather than the
              // domain rows, which would oblige `OpenItemsRow` to carry an
              // index signature and lose its typo-checking. Payload's own
              // `LogTable` does the same.
              data={docs.map(({ id }) => ({ id }))}
            />
            <div className={styles.pageControls}>
              <Pagination
                hasNextPage={rows.hasNextPage}
                hasPrevPage={rows.hasPrevPage}
                nextPage={rows.nextPage ?? undefined}
                onChange={(page) => setQuery({ page })}
                page={rows.page}
                prevPage={rows.prevPage ?? undefined}
                totalPages={rows.totalPages}
              />
              {rows.totalDocs > PAGE_LIMITS[0]! && (
                <PerPage
                  handleChange={(limit) => setQuery({ limit, page: 1 })}
                  limit={query.limit}
                  limits={PAGE_LIMITS}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
