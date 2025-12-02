import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import config from '@payload-config'

interface CollectionCardProps {
  title: string
  count: number
  href: string
}

/**
 * Collection Card Component (Client Component for hover effects)
 */
function CollectionCard({ title, count, href }: CollectionCardProps) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: 'calc(var(--base) * 1.5)',
        backgroundColor: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-100)',
        borderRadius: 'var(--style-radius-m)',
        textDecoration: 'none',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          fontSize: 'calc(var(--base-body-size) * 1px)',
          color: 'var(--theme-elevation-600)',
          marginBottom: 'calc(var(--base) * 0.5)',
          fontWeight: '600',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 'calc(var(--base-body-size) * 2.5px)',
          color: 'var(--theme-elevation-800)',
          fontWeight: 'bold',
        }}
      >
        {count}
      </div>
    </Link>
  )
}

/**
 * Metrics Dashboard Component (Server Component)
 *
 * Displays collection counts for WeMeditate App project.
 * Fetches data directly on the server for optimal performance.
 */
export default async function MetricsDashboard() {
  // Fetch data directly on the server
  const payload = await getPayload({ config })

  // Fetch counts across all locales in parallel
  const [meditationsResult, lessonsResult, musicResult] = await Promise.all([
    payload.count({ collection: 'meditations' }),
    payload.count({ collection: 'lessons' }),
    payload.count({ collection: 'music' }),
  ])

  return (
    <div
      style={{
        padding: 'calc(var(--base) * 2)',
      }}
    >
      {/* Collection Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: 'calc(var(--base) * 1.5)',
        }}
      >
        <CollectionCard
          title="Meditations"
          count={meditationsResult.totalDocs}
          href="/admin/collections/meditations"
        />

        <CollectionCard
          title="Path Steps"
          count={lessonsResult.totalDocs}
          href="/admin/collections/lessons"
        />

        <CollectionCard
          title="Music"
          count={musicResult.totalDocs}
          href="/admin/collections/music"
        />
      </div>
    </div>
  )
}
