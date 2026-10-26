import type { PayloadRequest } from 'payload'

import { Button, Card, Pill, Table } from '@payloadcms/ui'
import Link from 'next/link'
import { toWords } from 'payload/shared'

import styles from './AtlasAdminHome.module.css'
import { getAtlasOverviewData, type OverviewCount } from './data'
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

/**
 * The Sahaj Atlas home for an admin: how fresh the map is, what nobody owns,
 * what the public has proposed, and what changed last. Rows stay in Payload's
 * own list views, which every count links into.
 */
export default async function AtlasAdminHome({ req }: { req: PayloadRequest }) {
  const data = await getAtlasOverviewData(req)
  const dateFormat = new Intl.DateTimeFormat(req.i18n?.language ?? 'en', {
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

      <h2>Needs an owner</h2>
      <CountCards items={data.unowned.map((item) => ({ ...item, alert: true }))} />

      <h2>Public proposals</h2>
      <CountCards items={[{ ...data.proposals, alert: true }]} />

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
