import type { PayloadRequest, WidgetInstance } from 'payload'

import type { Event } from '@/payload-types'

import { isAtlasOrganiser } from '../helpers/isAtlasOrganiser'

export const ATLAS_PROGRAMS_WIDGET = 'atlas-programs'

export function atlasDashboardLayout({ req }: { req: PayloadRequest }): WidgetInstance[] {
  return [
    {
      widgetSlug: isAtlasOrganiser(req.user) ? ATLAS_PROGRAMS_WIDGET : 'collections',
      width: 'full',
    },
  ]
}

export type Program = Pick<Event, 'id' | 'title' | '_status' | 'verificationStage' | 'updatedAt'> &
  Partial<Pick<Event, 'eventType' | 'address'>> & {
    published: boolean
  }

/** Sort rank per stage; 0 and 1 need the organiser. A Record, so a new stage cannot be missed. */
const STAGE_RANK: Record<Event['verificationStage'], 0 | 1 | 2 | 3> = {
  urgent: 0,
  reminded: 1,
  escalated: 1,
  unverified: 1,
  expired: 1,
  denied: 1,
  verified: 2,
  finished: 3,
}

export function needsConfirmation(program: Program): boolean {
  return STAGE_RANK[program.verificationStage] <= 1
}

export type ProgramStatus = 'finished' | 'review' | 'published' | 'draft'

export function programStatus(program: Program): ProgramStatus {
  if (program.verificationStage === 'finished') return 'finished'
  if (needsConfirmation(program)) return 'review'
  return program.published ? 'published' : 'draft'
}

/** Urgent first, then needing review, then the rest; finished last. Newest edit first within a rank. */
export function sortPrograms(programs: Program[]): Program[] {
  return [...programs].sort(
    (a, b) =>
      STAGE_RANK[a.verificationStage] - STAGE_RANK[b.verificationStage] ||
      b.updatedAt.localeCompare(a.updatedAt),
  )
}

/**
 * The dashboard's tabs and summary counts, keyed on `programStatus` so the three
 * are disjoint: the summary adds them up, and a program's pill must agree with
 * whichever one counts it. Finished programs appear only under "all".
 */
export function programGroups(programs: Program[]) {
  const byStatus = (status: ProgramStatus) =>
    programs.filter((program) => programStatus(program) === status)
  return {
    all: programs,
    review: byStatus('review'),
    drafts: byStatus('draft'),
    published: byStatus('published'),
  }
}

/** Payload stores dashboard preferences as { layouts: [{ id, ... }] }. */
export function needsAtlasDashboardFallback(
  value: { layouts?: { id?: string }[] } | undefined,
): boolean {
  return (
    Array.isArray(value?.layouts) &&
    !value.layouts.some((item) => item.id?.startsWith(`${ATLAS_PROGRAMS_WIDGET}-`))
  )
}
