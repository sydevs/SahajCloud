import type { AtlasAdminHomeData, OverviewCount } from './data'

import { Button, Card, Pill, Table } from '@payloadcms/ui'
import Link from 'next/link'
import { toWords } from 'payload/shared'

import styles from './AtlasAdminHome.module.css'
import { PUBLIC_MAP_LINK } from '../../helpers/navLinks'
import { tableColumn } from '../../helpers/tableColumn'

/** Stages a manager has let slide, whose counts should catch the eye. */
const ALERT_STAGES = new Set(['urgent', 'expired'])

function CountCards({ items }: { items: (OverviewCount & { alert?: boolean })[] }) {
  return (
    <ul className={styles.cards}>
      {items.map((item) => (
        <li key={item.label}>
          <Card
            title={item.label}
            href={item.href}
            actions={
              <Pill size="small" pillStyle={item.alert && item.count > 0 ? 'error' : 'light-gray'}>
                {item.count}
              </Pill>
            }
          />
        </li>
      ))}
    </ul>
  )
}

/** Every count links into Payload's own list view, filtered to its rows. */
export function AtlasAdminHomeView({
  data,
  language,
}: {
  data: AtlasAdminHomeData
  language: string
}) {
  const dateFormat = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <section className={styles.home} aria-label="Sahaj Atlas overview">
      <header className={styles.header}>
        <div>
          <h1>Sahaj Atlas</h1>
          <p className={styles.subtitle}>Map-wide health, open work, and recent changes.</p>
        </div>
        <Button el="link" url={PUBLIC_MAP_LINK.href} buttonStyle="secondary" margin={false}>
          {PUBLIC_MAP_LINK.label}
        </Button>
      </header>

      <h2>Verification health</h2>
      <CountCards
        items={data.health.map((item) => ({ ...item, alert: ALERT_STAGES.has(item.stage) }))}
      />

      <h2>Needs attention</h2>
      <CountCards items={data.attention.map((item) => ({ ...item, alert: true }))} />

      <h2>Recent activity</h2>
      <Table
        data={data.recent}
        columns={[
          tableColumn(
            'program',
            'Program',
            data.recent.map((event) => (
              <Link key={event.id} href={`/admin/collections/events/${event.id}`} prefetch={false}>
                {event.title?.trim() || 'Untitled program'}
              </Link>
            )),
          ),
          tableColumn(
            'region',
            'Region',
            data.recent.map((event) => event.regionName ?? '—'),
          ),
          tableColumn(
            'stage',
            'Stage',
            data.recent.map((event) => toWords(event.verificationStage)),
          ),
          tableColumn(
            'updated',
            'Last change',
            data.recent.map((event) => (
              <span key={event.id} className={styles.recentMeta}>
                {dateFormat.format(new Date(event.updatedAt))}
                {event._status === 'draft' ? ' · draft' : ''}
              </span>
            )),
          ),
        ]}
      />
    </section>
  )
}
