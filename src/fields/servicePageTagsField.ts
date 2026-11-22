import type { SelectField } from 'payload'

import { SERVICE_PAGE_TAGS_FIELD } from '@/lib/pageServices'
import { PAGE_TAGS } from '@/lib/pageTags'

/**
 * The "Page tags" list on a service's configuration global: every published
 * page carrying one of these tags belongs to the service, beside the pages the
 * configuration names in its own page fields (`src/lib/pageServices`).
 */
export function servicePageTagsField({ service }: { service: string }): SelectField {
  return {
    name: SERVICE_PAGE_TAGS_FIELD,
    label: 'Page tags',
    type: 'select',
    hasMany: true,
    options: PAGE_TAGS,
    admin: {
      description:
        `Published pages carrying any of these tags belong to the ${service}, as well as every ` +
        "page this configuration names. Each page's sidebar says which services it belongs " +
        'to, and why.',
    },
  }
}
