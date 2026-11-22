import type { FieldHook, TextField } from 'payload'

import {
  loadServicePages,
  PAGE_SERVICES,
  pageServiceReasons,
  type PageService,
} from '@/lib/pageServices'
import { virtualFieldInputs } from '@/plugins/virtualFields'

const NOT_PLACED: Record<PageService, string> = {
  web: 'Not on the website. Name it in We Meditate Web › Configuration, or give it one of the page tags listed there.',
  app: 'Not in the app. Name it in We Meditate App › Configuration, or give it one of the page tags listed there.',
}

/**
 * One sidebar line per service: whether this page is available to it, and
 * which configuration field or tag places it there. Read-only — an editor
 * places a page by naming or tagging it, never here.
 */
export function serviceFields(): TextField[] {
  return (Object.keys(PAGE_SERVICES) as PageService[]).map((service) => ({
    name: service === 'web' ? 'onWebsite' : 'inApp',
    label: service === 'web' ? 'On the website' : 'In the app',
    type: 'text',
    virtual: true,
    custom: virtualFieldInputs('tags'),
    // A manager's answer about their own configuration, not part of the
    // page's public contract.
    access: { read: ({ req }) => req.user?.collection === 'managers' },
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
  return async ({ data, req }) => {
    if (data?.id == null) return null
    const reasons = pageServiceReasons(data, await loadServicePages(req, service))
    return reasons.length ? reasons.join(', ') : NOT_PLACED[service]
  }
}
