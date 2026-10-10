'use client'

import type { GroupFieldClientComponent } from 'payload'

import { useConfig, useDocumentInfo, useFormFields, useLocale, useRouteCache } from '@payloadcms/ui'
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
 * columns it renders and clears the route cache once the status leaves the
 * running set, which is what brings the review surface in.
 *
 * ⚠ **The poll is armed from form state, not from its own first answer.** A
 * batch is read long after it finished, so keying the request on the stored
 * status means a settled batch costs no request at all — and a save that moves
 * the status to `committing` arms it without a reload. SWR's focus and reconnect
 * revalidation are off for the same reason: `refreshInterval` is the one thing
 * that decides whether to ask again.
 *
 * ⚠ **A native `<progress>`, not `@payloadcms/ui`'s `ProgressBar`.** That export
 * is the route-transition bar: it takes no props and reads its value from
 * `RouteTransitionProvider`, so it cannot show a job's own count. The native
 * element carries the value to assistive technology, which no div does.
 */
export const ImportProgress: GroupFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const { code: locale } = useLocale()
  const { config } = useConfig()
  // `clearRouteCache` IS `router.refresh()`, inside the provider that owns the
  // admin's route-invalidation decision and its caching flag.
  const { clearRouteCache } = useRouteCache()
  const storedStatus = useFormFields(([fields]) => fields.status?.value)

  // The create form has no document to poll, and a batch no job holds has
  // nothing to report.
  const url =
    id === null || id === undefined || !isRunningStatus(storedStatus as string)
      ? null
      : progressUrl(config.routes.api, id, locale)

  // ⚠ **`refreshInterval` as a function, not `isPaused`.** `isPaused` would have
  // to read the hook's own `data` to know whether to stop, which is a cycle
  // TypeScript refuses outright (TS7022) — the function form is handed the
  // latest answer, so the poll stops itself without a second copy of the status.
  const { data, error } = useSWR(url, fetchBatch, {
    refreshInterval: (latest) => (!latest || isRunningStatus(latest.status) ? 3_000 : 0),
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })

  const settled = !!data && !isRunningStatus(data.status)

  useEffect(() => {
    if (settled) clearRouteCache()
  }, [clearRouteCache, settled])

  if (!url) return null
  if (error) {
    return (
      <p className="event-import__progress-note">
        This page could not reach the import. It keeps running — reload to see where it got to.
      </p>
    )
  }
  if (!data || settled) return null

  const { done, note, total } = data.progress ?? {}

  return (
    <div className="event-import__progress">
      {/* An indeterminate bar until the job has written a total: `max={0}` is
          invalid, and `max={done}` would read as finished before it starts. */}
      <progress max={total || undefined} value={total ? (done ?? 0) : undefined} />
      <p className="event-import__progress-note">
        {note ?? (total ? `${done ?? 0} of ${total}` : 'Starting…')}
      </p>
    </div>
  )
}

export default ImportProgress
