import type { InfoBannerType } from '@/components/admin/InfoBanner'
import type { PageService } from '@/lib/pageServices'

/** What the notice says: where the page is available, and how to widen that. */
export interface AvailabilityNotice {
  type: InfoBannerType
  title: string
  text?: string
}

/** Where a service serves its pages, as the title reads it. */
const WHERE: Record<PageService, string> = {
  web: 'on the website',
  app: 'in the app',
}

/** The admin path an editor places a page from. */
const CONFIGURATION: Record<PageService, string> = {
  web: 'We Meditate Web › Configuration',
  app: 'We Meditate App › Configuration',
}

/**
 * Where a page is available, in the words the sidebar shows.
 *
 * Both facts are needed, because each can be the one holding the page back: a
 * placed page nobody published is served nowhere, and a published page no
 * configuration names is too.
 */
export function availabilityNotice(
  published: boolean,
  placed: readonly PageService[],
): AvailabilityNotice {
  const missing = (Object.keys(WHERE) as PageService[]).filter((s) => !placed.includes(s))
  const where = placed.map((service) => WHERE[service]).join(' and ')

  const sentences: string[] = []
  if (!published && placed.length) sentences.push(`Publishing it makes it available ${where}.`)
  if (missing.length) {
    sentences.push(
      `Name it in ${missing.map((service) => CONFIGURATION[service]).join(' or ')}, or give it ` +
        'one of the Page tags listed there.',
    )
  }
  const text = sentences.join(' ') || undefined

  if (!published) return { type: 'default', title: 'Not published, so available nowhere', text }
  if (!placed.length) {
    return { type: 'warning', title: 'Not available on the website or in the app', text }
  }
  return { type: 'default', title: `Available ${where}`, text }
}
