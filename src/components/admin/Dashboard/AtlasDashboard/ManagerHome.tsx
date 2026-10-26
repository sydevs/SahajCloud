'use client'

import {
  Banner,
  Button,
  CalendarIcon,
  CheckIcon,
  Pagination,
  PerPage,
  Pill,
  Table,
  useRouteTransition,
} from '@payloadcms/ui'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import styles from './ManagerHome.module.css'
import {
  PROGRAM_LIMITS,
  programStatus,
  type AtlasDashboardData,
  type Program,
  type ProgramQuery,
  type ProgramStatus,
  type ProgramTab,
} from './model'
import { CenteredNotice } from '../../helpers/CenteredNotice'
import { PUBLIC_MAP_LINK } from '../../helpers/navLinks'
import { tableColumn } from '../../helpers/tableColumn'

const TABS: { value: ProgramTab; label: string }[] = [
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

/** The tab, page and page size live in the URL, so the server reads them and Back works. */
function useProgramQuery(): (patch: Partial<ProgramQuery>) => void {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { startRouteTransition } = useRouteTransition()
  return (patch) => {
    const params = new URLSearchParams(searchParams?.toString())
    for (const [key, value] of Object.entries(patch)) params.set(key, String(value))
    startRouteTransition(() => router.push(`${pathname}?${params.toString()}`))
  }
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
export function ManagerHome({ data }: { data: AtlasDashboardData }) {
  const setQuery = useProgramQuery()
  const { counts, programs, query } = data
  const rows = programs.docs
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
          {data.canCreate && counts.all > 0 && (
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
      {counts.all > 0 ? (
        <>
          {counts.review > 0 && (
            <Banner type="warning">
              <div className={styles.notice}>
                <div>
                  <strong>
                    {counts.review === 1
                      ? 'One program needs a check'
                      : `${counts.review} programs need a check`}
                  </strong>
                  <div>Confirm the time and location so visitors see current details.</div>
                </div>
                {query.tab !== 'review' && (
                  <Button
                    buttonStyle="secondary"
                    size="small"
                    margin={false}
                    onClick={() => setQuery({ tab: 'review', page: 1 })}
                  >
                    Show {counts.review === 1 ? 'it' : 'them'}
                  </Button>
                )}
              </div>
            </Banner>
          )}
          <div className={styles.filters} role="group" aria-label="Filter programs">
            {TABS.map((item) => (
              <Button
                key={item.value}
                margin={false}
                buttonStyle={query.tab === item.value ? 'subtle' : 'tab'}
                size="medium"
                onClick={() => setQuery({ tab: item.value, page: 1 })}
                extraButtonProps={{
                  'aria-pressed': query.tab === item.value,
                  'aria-controls': 'atlas-program-list',
                }}
              >
                {item.label}
                <span className={styles.filterCount}>{counts[item.value]}</span>
              </Button>
            ))}
          </div>
          <div id="atlas-program-list" aria-live="polite">
            {rows.length ? (
              <>
                <Table
                  data={rows}
                  columns={[
                    tableColumn(
                      'program',
                      'Program',
                      rows.map((program) => (
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
                      rows.map((program) => {
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
                      rows.map((program) => {
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
                <div className={styles.pageControls}>
                  <Pagination
                    hasNextPage={programs.hasNextPage}
                    hasPrevPage={programs.hasPrevPage}
                    nextPage={programs.nextPage ?? undefined}
                    page={programs.page}
                    prevPage={programs.prevPage ?? undefined}
                    totalPages={programs.totalPages}
                    onChange={(page) => setQuery({ page })}
                  />
                  {programs.totalDocs > PROGRAM_LIMITS[0]! && (
                    <PerPage
                      limit={query.limit}
                      limits={PROGRAM_LIMITS}
                      handleChange={(limit) => setQuery({ limit, page: 1 })}
                    />
                  )}
                </div>
              </>
            ) : (
              <CenteredNotice
                icon={<CheckIcon />}
                title={
                  query.tab === 'review'
                    ? 'Nothing needs your attention'
                    : 'No drafts at the moment'
                }
              >
                <p>
                  {query.tab === 'review'
                    ? 'Your programs are up to date.'
                    : 'New programs you save as drafts will appear here.'}
                </p>
                <Button
                  buttonStyle="secondary"
                  margin={false}
                  size="small"
                  onClick={() => setQuery({ tab: 'all', page: 1 })}
                >
                  Show all programs
                </Button>
              </CenteredNotice>
            )}
          </div>
        </>
      ) : (
        <CenteredNotice
          icon={<CalendarIcon />}
          title={data.canCreate ? 'Your first program starts here' : 'A home for your programs'}
        >
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
              <p>Nothing goes live until you publish.</p>
            </>
          )}
        </CenteredNotice>
      )}
    </section>
  )
}
