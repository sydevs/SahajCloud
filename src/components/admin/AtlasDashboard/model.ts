import type { PayloadRequest, WidgetInstance } from 'payload'

import type { Event } from '@/payload-types'

export function isAtlasOrganiser(user: PayloadRequest['user'] | undefined): boolean {
  return (
    user?.collection === 'managers' &&
    user.type === 'manager' &&
    user.currentProject === 'sahaj-atlas'
  )
}

export function atlasDashboardLayout({ req }: { req: PayloadRequest }): WidgetInstance[] {
  return [
    { widgetSlug: isAtlasOrganiser(req.user) ? 'atlas-programs' : 'collections', width: 'full' },
  ]
}

export type Program = Pick<Event, 'id' | 'title' | '_status' | 'verificationStage' | 'updatedAt'> &
  Partial<Pick<Event, 'eventType' | 'address'>> & {
    published: boolean
  }

export function needsConfirmation(event: Program): boolean {
  return ['urgent', 'reminded', 'escalated', 'unverified', 'expired', 'denied'].includes(
    event.verificationStage,
  )
}

export function programSummary(events: Program[]) {
  const active = events.filter((event) => event.verificationStage !== 'finished')
  return {
    published: active.filter((event) => event.published).length,
    drafts: active.filter((event) => !event.published).length,
    unpublishedChanges: active.filter((event) => event.published && event._status === 'draft')
      .length,
    needsConfirmation: active.filter(needsConfirmation).length,
    events: [...events].sort((a, b) => {
      const priority = (event: Program) =>
        event.verificationStage === 'finished'
          ? 3
          : event.verificationStage === 'urgent'
            ? 0
            : needsConfirmation(event)
              ? 1
              : 2
      return priority(a) - priority(b) || b.updatedAt.localeCompare(a.updatedAt)
    }),
  }
}

/** Payload stores dashboard preferences as { layouts: [{ id, ... }] }. */
export function needsAtlasDashboardFallback(
  value: { layouts?: { id?: string }[] } | undefined,
): boolean {
  return (
    Array.isArray(value?.layouts) &&
    !value.layouts.some((item) => item.id?.startsWith('atlas-programs-'))
  )
}
