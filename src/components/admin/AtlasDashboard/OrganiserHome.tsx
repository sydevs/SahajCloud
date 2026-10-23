'use client'

import type { getAtlasDashboardData } from './data'

import { Banner, Button, CalendarIcon, CheckIcon, Pill, Table } from '@payloadcms/ui'
import Link from 'next/link'
import { useState } from 'react'

import { tableColumn } from '../tableColumn'
import { needsConfirmation, type Program } from './model'
import styles from './OrganiserHome.module.css'

type DashboardData = NonNullable<Awaited<ReturnType<typeof getAtlasDashboardData>>>
type Filter = 'all' | 'review' | 'drafts'

function locationLabel(program: Program): string {
  if (program.eventType === 'online') return 'Online program'
  const location = [program.address?.venueName, program.address?.city].filter(Boolean).join(' · ')
  return location || 'Location to be added'
}

/** A small composition of native Payload controls; data and permissions stay on the server. */
export function OrganiserHome({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<Filter>('all')
  const reviewPrograms = data.events.filter(
    (program) => program.verificationStage !== 'finished' && needsConfirmation(program),
  )
  const draftPrograms = data.events.filter(
    (program) => program.verificationStage !== 'finished' && !program.published,
  )
  const programs =
    filter === 'review' ? reviewPrograms : filter === 'drafts' ? draftPrograms : data.events
  const firstReview = reviewPrograms[0]
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: 'all', label: 'All programs', count: data.events.length },
    { value: 'review', label: 'Needs review', count: reviewPrograms.length },
    { value: 'drafts', label: 'Drafts', count: draftPrograms.length },
  ]
  return (
    <section className={styles.home} aria-label="Atlas organiser dashboard">
      <header className={styles.header}>
        <div>
          <h1>Your programs</h1>
          <p className={styles.subtitle}>
            Manage your classes and keep their public details up to date.
          </p>
        </div>
        <div className={styles.actions}>
          <Button el="link" url="/admin/map" buttonStyle="secondary" margin={false}>
            View public map
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
            <strong>{data.published}</strong> published · <strong>{data.drafts}</strong>{' '}
            {data.drafts === 1 ? 'draft' : 'drafts'} · <strong>{data.needsConfirmation}</strong>{' '}
            awaiting review
          </p>
          {firstReview && (
            <Banner type="warning">
              <div className={styles.notice}>
                <div>
                  <strong>
                    {reviewPrograms.length === 1
                      ? 'One program needs a check'
                      : `${reviewPrograms.length} programs need a check`}
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
                  Review {reviewPrograms.length === 1 ? 'program' : 'first program'}
                </Button>
              </div>
            </Banner>
          )}
          <div className={styles.filters} role="group" aria-label="Filter programs">
            {filters.map((item) => (
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
                <span className={styles.filterCount}>{item.count}</span>
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
                        <Link href={`/admin/collections/events/${program.id}`}>
                          {program.title?.trim() || 'Untitled program'}
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
                      const finished = program.verificationStage === 'finished'
                      const review = !finished && needsConfirmation(program)
                      return (
                        <Pill
                          key={program.id}
                          size="small"
                          pillStyle={
                            finished
                              ? 'light-gray'
                              : review
                                ? 'warning'
                                : program.published
                                  ? 'success'
                                  : 'light-gray'
                          }
                        >
                          {finished
                            ? 'Finished'
                            : review
                              ? 'Needs review'
                              : program.published
                                ? 'Published'
                                : 'Draft'}
                        </Pill>
                      )
                    }),
                  ),
                  tableColumn(
                    'action',
                    'Next step',
                    programs.map((program) => {
                      const action =
                        program.verificationStage === 'finished'
                          ? 'View program'
                          : needsConfirmation(program)
                            ? 'Review details'
                            : program._status === 'draft'
                              ? 'Continue editing'
                              : 'Edit program'
                      return (
                        <Button
                          key={program.id}
                          el="link"
                          url={`/admin/collections/events/${program.id}`}
                          buttonStyle="secondary"
                          size="small"
                          margin={false}
                          aria-label={`${action}: ${program.title?.trim() || 'Untitled program'}`}
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
            finished programs.
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
            <Button
              el="link"
              url="/admin/collections/events/create"
              icon="plus"
              iconPosition="left"
              margin={false}
            >
              Add your first program
            </Button>
          )}
          {data.canCreate && <span>Nothing goes live until you publish.</span>}
        </div>
      )}
    </section>
  )
}
