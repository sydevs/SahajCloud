'use client'

import type { EventRegistrationsData, RegistrationFilter, RegistrationQuery } from './data'
import type { ReactNode } from 'react'

import { Button, CalendarIcon, CheckIcon, Gutter, Pagination, Pill, Table } from '@payloadcms/ui'

import { STATUS_LABELS } from '@/collections/UserSubmissions/statuses'

import styles from './EventRegistrations.module.css'
import { CenteredNotice } from '../CenteredNotice'
import { tableColumn } from '../helpers/tableColumn'
import { useSetQuery } from '../helpers/useSetQuery'

/** One table per filter: its button, the sentence above it, and its empty title. */
const FILTERS: Record<
  RegistrationFilter,
  { label: string; icon: ReactNode; empty: string; explain: string }
> = {
  active: {
    label: 'Registered',
    icon: <CalendarIcon />,
    empty: 'No one has registered yet',
    explain: 'Anyone who signs up through the map appears here, with their answers.',
  },
  withdrawn: {
    label: 'Withdrawn',
    icon: <CheckIcon />,
    empty: 'Nobody has withdrawn',
    // All three reasons `isActiveRegistration` drops a row, so a manager is not
    // told someone was declined when their confirmation simply never sent.
    explain:
      'A registration you declined, one screening refused, and one whose confirmation never sent are kept here rather than deleted.',
  },
}

const LIST_ID = 'event-registration-list'

/** A composition of native Payload controls; the rows and the gate stay on the server. */
export function EventRegistrationsView({ data }: { data: EventRegistrationsData }) {
  const setQuery = useSetQuery<RegistrationQuery>()
  const { filter, registrations } = data
  const rows = registrations.docs
  return (
    <Gutter className={styles.registrations}>
      {/* The same filter row as the manager dashboard's. */}
      <div className={styles.filters} role="group" aria-label="Filter registrations">
        {(Object.keys(FILTERS) as RegistrationFilter[]).map((value) => (
          <Button
            key={value}
            margin={false}
            buttonStyle={filter === value ? 'subtle' : 'tab'}
            size="medium"
            onClick={() => setQuery({ filter: value, page: 1 })}
            extraButtonProps={{ 'aria-pressed': filter === value, 'aria-controls': LIST_ID }}
          >
            {FILTERS[value].label}
          </Button>
        ))}
      </div>
      <div id={LIST_ID} aria-live="polite">
        <p className={styles.explain}>{FILTERS[filter].explain}</p>
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
                    <div key={row.id} className={styles.when}>
                      {row.registeredOn}
                      {row.attending && <small>Attending {row.attending}</small>}
                    </div>
                  )),
                ),
                tableColumn(
                  'status',
                  'Status',
                  rows.map((row) => (
                    <Pill key={row.id} size="small">
                      {STATUS_LABELS[row.status]}
                    </Pill>
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
