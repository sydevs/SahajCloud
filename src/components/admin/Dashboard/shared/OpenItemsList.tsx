'use client'

import { Banner, Button, CheckIcon, Pill, Table } from '@payloadcms/ui'
import { CalendarDays, FilePlus, Globe, type LucideIcon, MailWarning, UserX } from 'lucide-react'
import Link from 'next/link'

import styles from './Dashboard.module.css'
import { IconTip } from './IconTip'
import {
  OPEN_ITEM_TABS,
  type OpenItemsData,
  type OpenItemsRow,
  PAGE_LIMITS,
  type OpenItemTab,
} from './model'
import { FilterTabs, QueryPager } from '../../helpers/listControls'
import { tableColumn } from '../../helpers/tableColumn'

const LIST_ID = 'atlas-open-items'

/** The filter row's labels; `OPEN_ITEM_TABS` holds the order a reader meets them in. */
const FILTER_LABELS: Record<OpenItemTab, string> = {
  all: 'All',
  overdue: 'Overdue',
  review: 'To review',
  'no-manager': 'No manager',
  recommendations: 'Recommendations',
  mine: 'Your events',
}

const KIND: Record<OpenItemsRow['kind'], { icon: LucideIcon; label: string }> = {
  event: { icon: CalendarDays, label: 'Event' },
  proposal: { icon: FilePlus, label: 'Proposed event' },
  refusal: { icon: UserX, label: 'Sign-up' },
  'delivery-failed': { icon: MailWarning, label: 'Undelivered' },
  service: { icon: Globe, label: 'Website' },
}

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
  /** Offer the "Your events" filter — a region home only. */
  showMine?: boolean
}) {
  const { counts, progress, query, rows } = data
  const docs = rows.docs
  // `progress` is null for the admin alone, whose every row counts.
  const open = progress?.open ?? counts.all

  const visible = OPEN_ITEM_TABS.filter((tab) => {
    if (tab === 'all' || query.filter === tab) return true
    if (tab === 'mine') return Boolean(showMine) && counts.mine > 0
    return counts[tab] > 0
  })

  return (
    <div className={styles.list}>
      {/* All clear is about the counted rows, and a recommendation counts
          against nothing — so one listed under the banner needs saying, or the
          two read as contradicting each other. */}
      {open === 0 && (
        <Banner type="success">
          {counts.recommendations > 0
            ? `${emptyBanner} The suggestions below are optional.`
            : emptyBanner}
        </Banner>
      )}
      {counts.all > 0 && (
        <>
          {visible.length > 1 && (
            <FilterTabs
              active={query.filter}
              controls={LIST_ID}
              label="Filter open items"
              tabs={visible.map((tab) => ({
                count: tab === 'all' ? counts.all : counts[tab],
                label: FILTER_LABELS[tab],
                value: tab,
              }))}
            />
          )}
          <div id={LIST_ID}>
            <Table
              columns={[
                tableColumn(
                  'item',
                  'Item',
                  docs.map((row) => (
                    <div className={styles.itemInfo} key={row.id}>
                      <IconTip {...KIND[row.kind]} />
                      <div>
                        <Link href={row.href} prefetch={false}>
                          {row.title}
                        </Link>
                        {row.subtitle ? (
                          <span className={styles.itemSubtitle}>{row.subtitle}</span>
                        ) : null}
                      </div>
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
                      {row.lines.length > 0 && (
                        <div>
                          {row.lines.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
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
