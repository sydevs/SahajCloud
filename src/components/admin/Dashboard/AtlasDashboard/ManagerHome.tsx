'use client'

import { Banner, Button, CalendarIcon, CheckIcon, Pill, Table } from '@payloadcms/ui'
import Link from 'next/link'
import { useState } from 'react'

import type { getAtlasDashboardData } from './data'

import { PUBLIC_MAP_LINK } from '../../AdminNavLinks'
import { tableColumn } from '../../helpers/tableColumn'
import { programGroups, programStatus, type Program, type ProgramStatus } from './model'
import styles from './ManagerHome.module.css'

type DashboardData = Awaited<ReturnType<typeof getAtlasDashboardData>>
type Filter = 'all' | 'review' | 'drafts'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All programs' },
  { value: 'review', label: 'Needs review' },
  { value: 'drafts', label: 'Drafts' },
]

const STATUS: Record<
  ProgramStatus,
  { label: string; pillStyle: 'light-gray' | 'warning' | 'success' }
> = {
  finished: { label: 'Finished', pillStyle: 'light-gray' },
  review: { label: 'Needs review', pillStyle: 'warning' },
  published: { label: 'Published', pillStyle: 'success' },
  draft: { label: 'Draft', pillStyle: 'light-gray' },
}

function programTitle(program: Program): string {
  return program.title?.trim() || 'Untitled program'
}

function locationLabel(program: Program): string {
  if (program.eventType === 'online') return 'Online program'
  const location = [program.address?.venueName, program.address?.city].filter(Boolean).join(' · ')
  return location || 'Location to be added'
}

function nextStep(program: Program): string {
  const status = programStatus(program)
  if (status === 'finished') return 'View program'
  if (status === 'review') return 'Review details'
  // `_status`, not `published`: a live program with unpublished edits continues as a draft.
  return program._status === 'draft' ? 'Continue editing' : 'Edit program'
}

/** A small composition of native Payload controls; data and permissions stay on the server. */
export function ManagerHome({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<Filter>('all')
  const groups = programGroups(data.events)
  const programs = groups[filter]
  const firstReview = groups.review[0]
  return (
    <section className={styles.home} aria-label="Atlas manager dashboard">
      <header className={styles.header}>
        <div>
          <h1>Your programs</h1>
          <p className={styles.subtitle}>
            Manage your classes and keep their public details up to date.
          </p>
        </div>
        <div className={styles.actions}>
          <Button el="link" url={PUBLIC_MAP_LINK.href} buttonStyle="secondary" margin={false}>
            {PUBLIC_MAP_LINK.label}
          </Button>
          {data.canCreate && data.events.length > 0 && (
            <Button
              el="link"
              url="/admin/collections/events/create"
              icon="plus"
              iconPosition="left"
              margin={false}
            >
              Add new program
            </Button>
          )}
        </div>
      </header>
      {data.events.length > 0 ? (
        <>
          <p className={styles.summary} aria-label="Program overview">
            <strong>{groups.published.length}</strong> published ·{' '}
            <strong>{groups.drafts.length}</strong>{' '}
            {groups.drafts.length === 1 ? 'draft' : 'drafts'} ·{' '}
            <strong>{groups.review.length}</strong> awaiting review
          </p>
          {firstReview && (
            <Banner type="warning">
              <div className={styles.notice}>
                <div>
                  <strong>
                    {groups.review.length === 1
                      ? 'One program needs a check'
                      : `${groups.review.length} programs need a check`}
                  </strong>
                  <div>Confirm the time and location so visitors see current details.</div>
                </div>
                <Button
                  el="link"
                  url={`/admin/collections/events/${firstReview.id}`}
                  buttonStyle="secondary"
                  size="small"
                  margin={false}
                >
                  Review {groups.review.length === 1 ? 'program' : 'first program'}
                </Button>
              </div>
            </Banner>
          )}
          <div className={styles.filters} role="group" aria-label="Filter programs">
            {FILTERS.map((item) => (
              <Button
                key={item.value}
                margin={false}
                buttonStyle={filter === item.value ? 'subtle' : 'tab'}
                size="medium"
                onClick={() => setFilter(item.value)}
                extraButtonProps={{
                  'aria-pressed': filter === item.value,
                  'aria-controls': 'atlas-program-list',
                }}
              >
                {item.label}
                <span className={styles.filterCount}>{groups[item.value].length}</span>
              </Button>
            ))}
          </div>
          <div id="atlas-program-list" aria-live="polite">
            {programs.length ? (
              <Table
                data={programs}
                columns={[
                  tableColumn(
                    'program',
                    'Program',
                    programs.map((program) => (
                      <div key={program.id} className={styles.programInfo}>
                        <Link href={`/admin/collections/events/${program.id}`} prefetch={false}>
                          {programTitle(program)}
                        </Link>
                        <p>{locationLabel(program)}</p>
                        {program.published && program._status === 'draft' && (
                          <small>Unpublished changes</small>
                        )}
                      </div>
                    )),
                  ),
                  tableColumn(
                    'status',
                    'Status',
                    programs.map((program) => {
                      const status = STATUS[programStatus(program)]
                      return (
                        <Pill key={program.id} size="small" pillStyle={status.pillStyle}>
                          {status.label}
                        </Pill>
                      )
                    }),
                  ),
                  tableColumn(
                    'action',
                    'Next step',
                    programs.map((program) => {
                      const action = nextStep(program)
                      return (
                        <Button
                          key={program.id}
                          el="link"
                          url={`/admin/collections/events/${program.id}`}
                          buttonStyle="secondary"
                          size="small"
                          margin={false}
                          aria-label={`${action}: ${programTitle(program)}`}
                        >
                          {action}
                        </Button>
                      )
                    }),
                  ),
                ]}
              />
            ) : (
              <div className={styles.filteredEmpty}>
                <CheckIcon />
                <h3>
                  {filter === 'review' ? 'Nothing needs your attention' : 'No drafts at the moment'}
                </h3>
                <p>
                  {filter === 'review'
                    ? 'Your programs are up to date.'
                    : 'New programs you save as drafts will appear here.'}
                </p>
                <Button
                  buttonStyle="secondary"
                  margin={false}
                  size="small"
                  onClick={() => setFilter('all')}
                >
                  Show all programs
                </Button>
              </div>
            )}
          </div>
          <p className={styles.footnote}>
            Your programs and programs in the areas you manage appear here. Summary counts exclude
            finished programs. A published program awaiting review is counted under review and stays
            on the public map.
          </p>
        </>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <CalendarIcon />
          </div>
          <h2>{data.canCreate ? 'Your first program starts here' : 'A home for your programs'}</h2>
          <p>
            {data.canCreate
              ? 'Add the details, save a draft, and publish when you’re ready. We’ll help people find their way to you.'
              : 'Once a region manager assigns a program to you, you can keep its details up to date here.'}
          </p>
          {data.canCreate && (
            <>
              <Button
                el="link"
                url="/admin/collections/events/create"
                icon="plus"
                iconPosition="left"
                margin={false}
              >
                Add your first program
              </Button>
              <span>Nothing goes live until you publish.</span>
            </>
          )}
        </div>
      )}
    </section>
  )
}
