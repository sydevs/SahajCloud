'use client'

import type { UIFieldClientComponent } from 'payload'

import { useConfig, useDocumentInfo, useLocale } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import useSWR from 'swr'

import type { EventImport } from '@/payload-types'

import { isRunningStatus, progressUrl } from './progressUrl'

import './styles.css'

type Polled = Pick<EventImport, 'progress' | 'status'>

const fetchBatch = async (url: string): Promise<Polled> => {
  // `credentials: 'include'` because this is a same-origin admin read and the
  // session is a cookie — `fetch` omits it on a cross-origin default, and the
  // admin can be served from a different host than the API route.
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error(`The batch could not be read: ${response.status}`)
  return response.json() as Promise<Polled>
}

/**
 * How far the running job has got, while it is running.
 *
 * ⚠ **The form does not refresh itself, which is why this exists.** The resolve
 * job writes `rows`, `proposedRegions` and the status from a worker, so an open
 * edit view holds the document as it was at the create — the reviewer would sit
 * on "Resolving addresses" until they reloaded by hand. The bar polls the two
 * columns it renders and calls `router.refresh()` once the status leaves the
 * running set, which is what brings the review surface in.
 *
 * ⚠ **`isPaused`, not a conditional hook.** SWR must be called unconditionally,
 * so a terminal batch keeps the hook and stops the interval instead.
 *
 * ⚠ **A native `<progress>`, not `@payloadcms/ui`'s `ProgressBar`.** That
 * export is the route-transition bar: it takes no props and reads its value from
 * `RouteTransitionProvider`, so it cannot show a job's own count. The native
 * element carries the value to assistive technology for free, which no div can.
 */
export const ImportProgress: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const { code: locale } = useLocale()
  const { config } = useConfig()
  const router = useRouter()

  // The create form has no document to poll, and the field renders nothing
  // there — the batch does not exist until the save returns.
  const url = id === null || id === undefined ? null : progressUrl(config.routes.api, id, locale)

  // ⚠ **`refreshInterval` as a function, not `isPaused`.** `isPaused` would have
  // to read the hook's own `data` to know whether to stop, which is a cycle
  // TypeScript refuses outright (TS7022) — the function form is handed the
  // latest answer, so the poll stops itself without a second copy of the status.
  const { data, error } = useSWR(url, fetchBatch, {
    refreshInterval: (latest) => (!latest || isRunningStatus(latest.status) ? 3_000 : 0),
  })

  const status = data?.status
  const settled = !!status && !isRunningStatus(status)

  useEffect(() => {
    if (settled) router.refresh()
  }, [router, settled])

  if (!url || (!data && !error)) return null
  if (error) {
    return (
      <p className="event-import__progress-note">
        This page could not reach the import. It keeps running — reload to see where it got to.
      </p>
    )
  }
  if (!isRunningStatus(status)) return null

  const done = data?.progress?.done ?? 0
  const total = data?.progress?.total ?? 0

  return (
    <div className="event-import__progress">
      {/* An indeterminate bar until the job has written a total: `max={0}` is
          invalid, and `max={done}` would read as finished before it starts. */}
      <progress max={total || undefined} value={total ? done : undefined} />
      <p className="event-import__progress-note">
        {data?.progress?.note ?? (total ? `${done} of ${total}` : 'Starting…')}
      </p>
    </div>
  )
}

export default ImportProgress
