'use client'

import { Banner, Button, CheckIcon, Pill, Table } from '@payloadcms/ui'
import Link from 'next/link'

import type { OpenItemFilter } from '@/lib/atlasOverview/filters'
import { OPEN_ITEM_FILTERS } from '@/lib/atlasOverview/filters'

import styles from './Dashboard.module.css'
import { type OpenItemsData, type OpenItemsRow, PAGE_LIMITS, type OpenItemTab } from './model'
import { FilterTabs, QueryPager } from '../../helpers/listControls'
import { tableColumn } from '../../helpers/tableColumn'

const LIST_ID = 'atlas-open-items'

const FILTER_LABELS: Record<OpenItemFilter, string> = {
  'no-manager': 'No manager',
  overdue: 'Overdue',
  recommendations: 'Recommendations',
  review: 'To review',
}

/** The filter row, in the order a reader meets the problems behind it. */
const FILTERS: { label: string; value: OpenItemTab }[] = [
  { label: 'All', value: 'all' },
  ...OPEN_ITEM_FILTERS.map((filter) => ({ label: FILTER_LABELS[filter], value: filter })),
  { label: 'Your programs', value: 'mine' },
]

function StatusPill({ status }: { status: OpenItemsRow['statuses'][number] }) {
  if (status.pill === 'check') {
    return (
      <span className={styles.tick}>
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
 * ⚠ **Every next step is a link to an edit view that already exists.** Verify
 * works because a manager's republish re-verifies
 * (`Events/hooks/syncVerificationOnSave.ts`).
 *
 * ⚠ **A filter with nothing in it is hidden**, not shown at zero.
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
  const { counts, progress, query, rows } = data
  const docs = rows.docs
  // `progress` is null for the admin alone, whose every row counts.
  const open = progress?.open ?? counts.all

  const visible = FILTERS.filter((filter) => {
    if (filter.value === 'all') return true
    if (filter.value === 'mine') return Boolean(showMine) && counts.mine > 0
    return counts[filter.value] > 0 || query.filter === filter.value
  })

  return (
    <div className={styles.list} id={LIST_ID}>
      {/* All clear is about the counted rows: up-to-date programs still list under it. */}
      {open === 0 && <Banner type="success">{emptyBanner}</Banner>}
      {counts.all > 0 && (
        <>
          {visible.length > 1 && (
            <FilterTabs
              active={query.filter}
              controls={LIST_ID}
              label="Filter open items"
              tabs={visible.map((filter) => ({
                count: filter.value === 'all' ? counts.all : counts[filter.value],
                ...filter,
              }))}
            />
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
                      <div className={styles.pills}>
                        {row.statuses.map((status) => (
                          <StatusPill key={status.key} status={status} />
                        ))}
                      </div>
                      {row.statuses.some((status) => status.line) && (
                        <p>
                          {row.statuses
                            .map((status) => status.line)
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      )}
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
                        // The first row's step is the one to take now.
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
              // `Table` reads nothing off a row but `id`, so it gets the ids alone:
              // widening `OpenItemsRow` with an index signature would turn every
              // misspelled read into `unknown` instead of an error.
              data={docs.map(({ id }) => ({ id }))}
            />
            <QueryPager docs={rows} limits={PAGE_LIMITS} />
          </div>
        </>
      )}
    </div>
  )
}
