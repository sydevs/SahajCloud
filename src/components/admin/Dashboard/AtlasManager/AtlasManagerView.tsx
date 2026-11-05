'use client'

import { Button, CalendarIcon } from '@payloadcms/ui'

import type { AtlasManagerData } from './data'
import { NAV_LINKS } from '../../AdminNavLinks/links'
import { CenteredNotice } from '../../CenteredNotice'
import styles from '../shared/Dashboard.module.css'
import { OpenItemsList } from '../shared/OpenItemsList'
import { ProgressMeter } from '../shared/ProgressMeter'
import { SectionTabs } from '../shared/SectionTabs'
import { StatTiles } from '../shared/StatTiles'

/**
 * A program manager's home.
 *
 * It opens on the one list that matters — what is waiting for them — rather
 * than on a page of programs they then have to read for problems. The
 * analytics above it are context, and the meter says how close to done they
 * are, which is the question a volunteer actually has.
 */
export function AtlasManagerView({ data }: { data: AtlasManagerData }) {
  const { items, statistics } = data
  const open = items.progress?.open ?? 0
  const hasPrograms = statistics.analytics[0]?.value ?? 0

  if (!hasPrograms) {
    return (
      <section aria-label="Your programs" className={styles.home}>
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
                icon="plus"
                iconPosition="left"
                margin={false}
                url="/admin/collections/events/create"
              >
                Add your first program
              </Button>
              <p>Nothing goes live until you publish.</p>
            </>
          )}
        </CenteredNotice>
      </section>
    )
  }

  return (
    <section aria-label="Your programs" className={styles.home}>
      <header className={styles.header}>
        <div>
          <h1>Your programs</h1>
          <p className={styles.subtitle}>
            Manage your classes and keep their public details up to date.
          </p>
        </div>
        <div className={styles.actions}>
          <Button buttonStyle="secondary" el="link" margin={false} url={NAV_LINKS.map.href}>
            {NAV_LINKS.map.label}
          </Button>
          {data.canCreate && (
            <Button
              el="link"
              icon="plus"
              iconPosition="left"
              margin={false}
              url="/admin/collections/events/create"
            >
              Add new program
            </Button>
          )}
        </div>
      </header>

      <StatTiles label="Your programs in the last 30 days" tiles={statistics.analytics} />
      {statistics.mostRegistered ? (
        <p className={styles.closingNote}>
          Most registered: {statistics.mostRegistered.title} ·{' '}
          {statistics.mostRegistered.registrations} sign-ups
        </p>
      ) : null}

      <SectionTabs active="items" tabs={[{ count: open, label: 'Open items', value: 'items' }]} />
      {items.progress ? <ProgressMeter progress={items.progress} /> : null}
      <OpenItemsList
        data={items}
        emptyBanner="All clear. Every program is on track."
        open={open}
      />
    </section>
  )
}
