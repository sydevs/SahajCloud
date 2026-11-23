import type { UIFieldServerComponent } from 'payload'

import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { isPublished } from '@/fields/publicUrlFields'
import { loadServicePages, pagePlacement, PAGE_SERVICE_GLOBALS } from '@/lib/pageServices'
import type { PageService } from '@/lib/pageServices'

import { availabilityNotice, type ServicePlacement } from './notice'
import { readAsRequestUser } from '../helpers/readAsRequestUser'

/**
 * Where this page is available — the website, the app, both or neither. Each
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
  const notice = availabilityNotice(
    isPublished(page._status, req.locale),
    placement.filter((entry): entry is ServicePlacement => entry.placement !== null),
  )

  return (
    <InfoBanner title={notice.title} type={notice.type}>
      {notice.text}
    </InfoBanner>
  )
}

export default PageAvailability
