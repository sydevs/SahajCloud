import type { SelectField } from 'payload'

import { PAGE_SERVICES, SERVICE_PAGE_TAGS_FIELD, type PageService } from '@/lib/pageServices'
import { PAGE_TAGS } from '@/lib/pageTags'

/**
 * The "Page tags" list on a service's configuration global: every published
 * page carrying one of these tags belongs to the service, beside the pages the
 * configuration names in its own page fields (`src/lib/pageServices`).
 */
export function servicePageTagsField(service: PageService): SelectField {
  const { noun } = PAGE_SERVICES[service]
  return {
    name: SERVICE_PAGE_TAGS_FIELD,
    label: 'Page tags',
    type: 'select',
    hasMany: true,
    options: PAGE_TAGS,
    admin: {
      description:
        `Published pages carrying any of these tags belong to the ${noun}, as well as every ` +
        "page this configuration names. Each page's sidebar says which services it belongs " +
        'to, and why.',
    },
  }
}
