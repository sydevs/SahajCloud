'use client'

import type {
  EventRegistrationsData,
  RegistrationFilter,
  RegistrationQuery,
  RegistrationRow,
} from './data'
import type { PillProps } from '@payloadcms/ui/elements/Pill'
import type { ReactNode } from 'react'

import {
  Button,
  CalendarIcon,
  CheckIcon,
  Gutter,
  Pagination,
  Pill,
  Table,
  XIcon,
} from '@payloadcms/ui'

import { STATUS_LABELS } from '@/collections/UserSubmissions/statuses'

import styles from './EventRegistrations.module.css'
import { CenteredNotice } from '../CenteredNotice'
import { tableColumn } from '../helpers/tableColumn'
import { useSetQuery } from '../helpers/useSetQuery'

const FILTERS: Record<RegistrationFilter, { label: string; icon: ReactNode; empty: string }> = {
  accepted: { label: 'Accepted', icon: <CheckIcon />, empty: 'No accepted registrations yet' },
  pending: {
    label: 'Pending',
    icon: <CalendarIcon />,
    empty: 'Nothing is waiting to be confirmed',
  },
  withdrawn: { label: 'Withdrawn', icon: <XIcon />, empty: 'Nobody has withdrawn' },
}

/**
 * Green once confirmed, yellow while waiting, red once it no longer counts —
 * the three filters at a glance. The detail says which of the three withdrawn
 * statuses it is, because "Failed" alone does not tell a manager the
 * registrant was never told they are registered.
 */
const STATUS: Record<
  RegistrationRow['status'],
  { pillStyle: PillProps['pillStyle']; detail: string }
> = {
  accepted: { pillStyle: 'success', detail: 'Confirmation email sent' },
  pending: { pillStyle: 'warning', detail: 'Awaiting screening and confirmation' },
  failed: { pillStyle: 'error', detail: 'Confirmation email could not be sent' },
  spam: { pillStyle: 'error', detail: 'Flagged by spam screening' },
  confirmed_spam: { pillStyle: 'error', detail: 'Confirmed as spam by an admin' },
  rejected: { pillStyle: 'error', detail: 'Declined by an admin' },
}

const LIST_ID = 'event-registration-list'

/** A composition of native Payload controls; the rows and the gate stay on the server. */
export function EventRegistrationsView({ data }: { data: EventRegistrationsData }) {
  const setQuery = useSetQuery<RegistrationQuery>()
  const { counts, csvUrl, filter, registrations } = data
  const rows = registrations.docs

  // Counted across every filter, not this page: an event whose only signups
  // were withdrawn still has a history worth showing.
  if (counts.accepted + counts.pending + counts.withdrawn === 0) {
    return (
      <Gutter className={styles.registrations}>
        <NoRegistrationsYet data={data} />
      </Gutter>
    )
  }

  // A filter with nothing under it is a tab that only ever opens an empty
  // notice, so it is left out — unless it is the one the URL already chose,
  // which must stay visible so the visitor can see where they are. Accepted
  // alone is no choice at all, and the tab's own pill already carries its count.
  const visibleFilters = (Object.keys(FILTERS) as RegistrationFilter[]).filter(
    (value) => counts[value] > 0 || value === filter,
  )
  const showFilters = visibleFilters.length > 1 || filter !== 'accepted'

  return (
    <Gutter className={styles.registrations}>
      <div className={styles.toolbar}>
        {/* Payload's own document-tab markup — the header's Edit / Versions
            row — so the filters and their counts match it in every state. */}
        {showFilters && (
          <div className="doc-tabs__tabs" role="group" aria-label="Filter registrations">
            {visibleFilters.map((value) => (
              <Button
                key={value}
                buttonStyle="tab"
                className={value === filter ? 'doc-tab doc-tab--active' : 'doc-tab'}
                disabled={value === filter}
                margin={false}
                size="medium"
                onClick={() => setQuery({ filter: value, page: 1 })}
                extraButtonProps={{ 'aria-pressed': value === filter, 'aria-controls': LIST_ID }}
              >
                <span className="doc-tab__label">
                  {FILTERS[value].label}
                  <span className="pill-version-count">{counts[value]}</span>
                </span>
              </Button>
            ))}
          </div>
        )}
        {/* The file holds the accepted rows alone, so it is offered beside
            them and not under a filter it would not match. */}
        {filter === 'accepted' && counts.accepted > 0 && (
          <Button
            buttonStyle="secondary"
            className={styles.csv}
            el="anchor"
            margin={false}
            size="medium"
            url={csvUrl}
          >
            Download (CSV)
          </Button>
        )}
      </div>
      <div id={LIST_ID} aria-live="polite">
        {/* On `totalDocs`, not this page's rows: a hand-typed page past the end
            has none, and the pager that gets you back must still render. */}
        {registrations.totalDocs > 0 ? (
          <>
            <Table
              data={rows}
              columns={[
                tableColumn(
                  'registrant',
                  'Name',
                  rows.map((row) => (
                    <span key={row.id} className={styles.name}>
                      {row.name || 'Name not given'}
                    </span>
                  )),
                ),
                tableColumn(
                  'email',
                  'Email',
                  rows.map((row) => <span key={row.id}>{row.email}</span>),
                ),
                tableColumn(
                  'registered',
                  'Registered on',
                  rows.map((row) => (
                    <div key={row.id} className={styles.stacked}>
                      {row.registeredOn}
                      {row.attending && <small>Attending {row.attending}</small>}
                    </div>
                  )),
                ),
                tableColumn(
                  'status',
                  'Status',
                  rows.map((row) => (
                    <div key={row.id} className={styles.stacked}>
                      <Pill pillStyle={STATUS[row.status].pillStyle} size="small">
                        {STATUS_LABELS[row.status]}
                      </Pill>
                      <small>{STATUS[row.status].detail}</small>
                    </div>
                  )),
                ),
                tableColumn(
                  'answers',
                  'Answers',
                  rows.map((row) => (
                    <dl key={row.id} className={styles.answers}>
                      {row.answers.map((answer) => (
                        <div key={answer.label}>
                          <dt>{answer.label}</dt>
                          <dd>{answer.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )),
                ),
              ]}
            />
            <Pagination
              hasNextPage={registrations.hasNextPage}
              hasPrevPage={registrations.hasPrevPage}
              nextPage={registrations.nextPage ?? undefined}
              page={registrations.page}
              prevPage={registrations.prevPage ?? undefined}
              totalPages={registrations.totalPages}
              onChange={(page) => setQuery({ page })}
            />
          </>
        ) : (
          <CenteredNotice icon={FILTERS[filter].icon} title={FILTERS[filter].empty} />
        )}
      </div>
    </Gutter>
  )
}

/**
 * The whole tab for an event nobody has registered for yet: say so, and point
 * the manager at the one lever they hold — the listing itself, through the
 * open items of its Recommendations panel.
 */
function NoRegistrationsYet({ data }: { data: EventRegistrationsData }) {
  const { editUrl, recommendations } = data
  const open = recommendations?.checked ? recommendations.open : []
  return (
    <CenteredNotice icon={<CalendarIcon />} title="No registrations yet">
      <p>
        Nobody has registered for this event so far. Seekers choose a class from its listing, so a
        clear title, a full description and photos make the most difference to who signs up.
      </p>
      {recommendations && !recommendations.checked && <p>{recommendations.reason}</p>}
      {recommendations?.checked && open.length === 0 && (
        <p>
          This listing already follows every recommendation. New registrations will appear here as
          they arrive.
        </p>
      )}
      {open.length > 0 && (
        <>
          <p>These recommendations are still open on the listing:</p>
          <ul className={styles.recommendations}>
            {open.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </>
      )}
      {(open.length > 0 || !recommendations?.checked) && (
        <Button buttonStyle="primary" el="link" margin={false} size="medium" url={editUrl}>
          {open.length > 0 ? 'Review recommendations' : 'Open the listing'}
        </Button>
      )}
    </CenteredNotice>
  )
}
