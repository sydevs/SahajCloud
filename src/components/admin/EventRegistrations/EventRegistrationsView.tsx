'use client'

import type { ReactNode } from 'react'

import { CalendarIcon, CheckIcon, Gutter, Pill, Table } from '@payloadcms/ui'

import { STATUS_LABELS } from '@/collections/UserSubmissions/statuses'

import styles from './EventRegistrations.module.css'
import {
  REGISTRATION_FILTERS,
  type EventRegistrationsData,
  type RegistrationFilter,
  type RegistrationQuery,
} from './model'
import { CenteredNotice } from '../CenteredNotice'
import { FilterTabs } from '../helpers/FilterTabs'
import { PageControls } from '../helpers/PageControls'
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
    // All three reasons `isActiveRegistration` drops a row, because the copy
    // must not tell a manager someone was declined when their confirmation
    // simply never sent. The Status column names which one — which is why this
    // sentence sits above the rows and not only in the empty notice.
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
      <FilterTabs
        controls={LIST_ID}
        label="Filter registrations"
        onSelect={(next) => setQuery({ filter: next, page: 1 })}
        selected={filter}
        tabs={REGISTRATION_FILTERS.map((value) => ({ value, label: FILTERS[value].label }))}
      />
      <div id={LIST_ID} aria-live="polite">
        <p className={styles.explain}>{FILTERS[filter].explain}</p>
        {/* On `totalDocs`, not on this page's rows: a hand-typed page past the
            end has none, and the notice would then claim the event has no
            registrants while the pager that gets you back was hidden too. */}
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
            <PageControls docs={registrations} onPage={(page) => setQuery({ page })} />
          </>
        ) : (
          <CenteredNotice icon={FILTERS[filter].icon} title={FILTERS[filter].empty} />
        )}
      </div>
    </Gutter>
  )
}
