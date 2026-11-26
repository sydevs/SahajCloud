import type { UIFieldServerComponent } from 'payload'

import React from 'react'

import { isPublished } from '@/fields/publicUrlFields'
import { loadServicePages, pagePlacement, PAGE_SERVICE_GLOBALS } from '@/lib/pageServices'
import type { PageService } from '@/lib/pageServices'

import { pageAvailability, type ServicePlacement } from './availability'
import { AvailabilityTable } from './AvailabilityTable'
import styles from './PageAvailability.module.css'
import { readAsRequestUser } from '../helpers/readAsRequestUser'

/**
 * Where this page is available — one row per service, colour-coded. Each
 * service's configuration decides it, by naming the page or by a tag it lists
 * (`src/lib/pageServices`), so there is nothing to set here.
 *
 * ⚠ **`readAsRequestUser` is the read gate** (#1126): a field component renders
 * on any `form-state` request, and that request names its own row.
 *
 * It reads the **published** row, not the draft the editor is typing into,
 * because that is the one a service serves.
 */
const PageAvailability: UIFieldServerComponent = async ({ id, req }) => {
  const pageId = typeof id === 'string' ? Number(id) : id
  if (pageId == null || Number.isNaN(pageId)) return null

  const page = await readAsRequestUser(req, 'pages', pageId, { _status: true, tags: true })
  if (!page) return null

  const services = Object.keys(PAGE_SERVICE_GLOBALS) as PageService[]
  const placement = await Promise.all(
    services.map(async (service) => ({
      service,
      placement: pagePlacement(page, await loadServicePages(req, service)),
    })),
  )
  const report = pageAvailability(
    isPublished(page._status, req.locale),
    placement.filter((entry): entry is ServicePlacement => entry.placement !== null),
  )

  return (
    <div>
      <AvailabilityTable rows={report.rows} />
      {report.hint ? <p className={styles.hint}>{report.hint}</p> : null}
    </div>
  )
}

export default PageAvailability
