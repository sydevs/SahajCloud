import type { PayloadRequest } from 'payload'

import { CalendarIcon } from '@payloadcms/ui'

import { getAtlasManagerData } from './data'
import { CenteredNotice } from '../../CenteredNotice'
import styles from '../shared/Dashboard.module.css'
import { AddProgramButton, HomeHeader } from '../shared/HomeHeader'
import { parseDashboardQuery } from '../shared/model'
import { OpenItemsList } from '../shared/OpenItemsList'
import { SectionTabs } from '../shared/SectionTabs'
import { StatTiles } from '../shared/StatTiles'

type AtlasManagerProps = {
  req: PayloadRequest
  searchParams?: Record<string, string | string[] | undefined>
}

/** The Sahaj Atlas home for a program manager: what is waiting on their own classes. */
export default async function AtlasManager({ req, searchParams }: AtlasManagerProps) {
  const { canCreate, items, statistics } = await getAtlasManagerData(
    req,
    parseDashboardQuery(searchParams),
  )

  if (!statistics.analytics.find((tile) => tile.key === 'programs')?.value) {
    return (
      <section aria-label="Your events" className={styles.home}>
        <CenteredNotice
          icon={<CalendarIcon />}
          title={canCreate ? 'Your first event starts here' : 'A home for your events'}
        >
          <p>
            {canCreate
              ? 'Add the details, save a draft, and publish when you’re ready. We’ll help people find their way to you.'
              : 'Once a region manager assigns an event to you, you can keep its details up to date here.'}
          </p>
          {canCreate && (
            <>
              <AddProgramButton>Add your first event</AddProgramButton>
              <p>Nothing goes live until you publish.</p>
            </>
          )}
        </CenteredNotice>
      </section>
    )
  }

  return (
    <section aria-label="Your events" className={styles.home}>
      <HomeHeader
        canCreate={canCreate}
        subtitle="Manage your events and keep their public details up to date."
        title="Your events"
      />
      <StatTiles label="Statistics" note="Last 30 days" tiles={statistics.analytics} />
      {statistics.mostRegistered ? (
        <p className={styles.closingNote}>
          Most registered: {statistics.mostRegistered.title} ·{' '}
          {statistics.mostRegistered.registrations} sign-ups
        </p>
      ) : null}
      <SectionTabs
        active="items"
        progress={items.progress}
        tabs={[
          { count: items.progress?.open ?? items.counts.all, label: 'Open items', value: 'items' },
        ]}
      />
      <OpenItemsList data={items} emptyBanner="All clear. Every event is on track." />
    </section>
  )
}
