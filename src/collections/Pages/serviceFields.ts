import type { FieldHook, TextField } from 'payload'

import {
  loadServicePages,
  PAGE_SERVICES,
  pageServiceReasons,
  type PageService,
} from '@/lib/pageServices'
import { managersOnlyFieldAccess } from '@/plugins/access'
import { virtualFieldInputs } from '@/plugins/virtualFields'

/**
 * One sidebar line per service: whether this page is available to it, and
 * which configuration field or tag places it there. Read-only — an editor
 * places a page by naming or tagging it, never here.
 */
export function serviceFields(): TextField[] {
  return (Object.keys(PAGE_SERVICES) as PageService[]).map((service) => ({
    name: PAGE_SERVICES[service].sidebarField,
    label: PAGE_SERVICES[service].sidebarLabel,
    type: 'text',
    virtual: true,
    custom: virtualFieldInputs('tags'),
    // A manager's answer about their own configuration, not part of the
    // page's public contract.
    access: { read: managersOnlyFieldAccess },
    admin: {
      readOnly: true,
      position: 'sidebar',
      disableListColumn: true,
      disableListFilter: true,
    },
    hooks: { afterRead: [describeService(service)] },
  }))
}

function describeService(service: PageService): FieldHook {
  return async ({ data, req, findMany, overrideAccess }) => {
    // Only the edit view shows the line. A list, a populate and a client read
    // would pay two configuration reads for a value nobody sees: field access
    // runs after this hook, and strips it from a client anyway.
    if (findMany || (!overrideAccess && req.user?.collection !== 'managers')) return null
    if (data?.id == null) return null

    const reasons = pageServiceReasons(data, await loadServicePages(req, service))
    return reasons.length ? reasons.join(', ') : PAGE_SERVICES[service].notPlaced
  }
}
