'use client'

import type { ReactNode } from 'react'

import { Button, CalendarIcon, CheckIcon, Gutter, Pagination, Pill, Table } from '@payloadcms/ui'

import { STATUS_LABELS } from '@/collections/UserSubmissions/statuses'

import styles from './EventRegistrations.module.css'
import {
  type EventRegistrationsData,
  type RegistrationFilter,
  type RegistrationQuery,
} from './model'
import { CenteredNotice } from '../CenteredNotice'
import { tableColumn } from '../helpers/tableColumn'
import { useSetQuery } from '../helpers/useSetQuery'

const FILTERS: { value: RegistrationFilter; label: string }[] = [
  { value: 'active', label: 'Registered' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const EMPTY: Record<RegistrationFilter, { icon: ReactNode; title: string; body: string }> = {
  active: {
    icon: <CalendarIcon />,
    title: 'No one has registered yet',
    body: 'Anyone who signs up through the map appears here, with their answers.',
  },
  withdrawn: {
    icon: <CheckIcon />,
    title: 'Nobody has withdrawn',
    body: 'A registration you decline, or one screening refuses, is kept here rather than deleted.',
  },
}

/** A composition of native Payload controls; the rows and the gate stay on the server. */
export function EventRegistrationsView({ data }: { data: EventRegistrationsData }) {
  const setQuery = useSetQuery<RegistrationQuery>()
  const { query, registrations } = data
  const rows = registrations.docs
  return (
    <Gutter className={styles.registrations}>
      <div className={styles.filters} role="group" aria-label="Filter registrations">
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            margin={false}
            buttonStyle={query.filter === filter.value ? 'subtle' : 'tab'}
            size="medium"
            onClick={() => setQuery({ filter: filter.value, page: 1 })}
            extraButtonProps={{
              'aria-pressed': query.filter === filter.value,
              'aria-controls': 'event-registration-list',
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      <div id="event-registration-list" aria-live="polite">
        {rows.length ? (
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
            {registrations.totalPages > 1 && (
              <div className={styles.pageControls}>
                <Pagination
                  hasNextPage={registrations.hasNextPage}
                  hasPrevPage={registrations.hasPrevPage}
                  nextPage={registrations.nextPage ?? undefined}
                  page={registrations.page}
                  prevPage={registrations.prevPage ?? undefined}
                  totalPages={registrations.totalPages}
                  onChange={(page) => setQuery({ page })}
                />
              </div>
            )}
          </>
        ) : (
          <CenteredNotice icon={EMPTY[query.filter].icon} title={EMPTY[query.filter].title}>
            <p>{EMPTY[query.filter].body}</p>
          </CenteredNotice>
        )}
      </div>
    </Gutter>
  )
}
