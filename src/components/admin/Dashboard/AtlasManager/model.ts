import type { PaginatedDocs } from 'payload'

import { stageRank } from '@/lib/eventVerification/stages'
import type { Event } from '@/payload-types'

export type Program = Pick<Event, 'id' | 'title' | '_status' | 'verificationStage' | 'updatedAt'> &
  Partial<Pick<Event, 'eventType' | 'address'>> & {
    published: boolean
  }

export const PROGRAM_TABS = ['all', 'review', 'drafts'] as const
export type ProgramTab = (typeof PROGRAM_TABS)[number]

export const PROGRAM_LIMITS = [10, 25, 50, 100]
const DEFAULT_LIMIT = 50

export type ProgramQuery = { tab: ProgramTab; page: number; limit: number }

/** What the loader reads and the home renders: the one shape both sides import. */
export type AtlasManagerData = {
  canCreate: boolean
  query: ProgramQuery
  counts: Record<ProgramTab, number>
  programs: PaginatedDocs<Program>
}

/** The home's URL state; anything unrecognised falls back to the first page of every program. */
export function parseProgramQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): ProgramQuery {
  const read = (key: string) => {
    const value = searchParams?.[key]
    return Array.isArray(value) ? value[0] : value
  }
  const tab = PROGRAM_TABS.find((candidate) => candidate === read('tab')) ?? 'all'
  const page = Math.max(1, Number.parseInt(read('page') ?? '', 10) || 1)
  const limit = PROGRAM_LIMITS.find((candidate) => String(candidate) === read('limit'))
  return { tab, page, limit: limit ?? DEFAULT_LIMIT }
}

/** The columns the home orders and counts by, read for every program in scope. */
export type ProgramRow = Pick<Event, 'id' | '_status' | 'verificationStage' | 'updatedAt'>

/**
 * Whether a program belongs on a tab. Ranks 0 and 1 need the manager; a draft
 * is a settled program that has never gone live. Finished programs appear only
 * under "all".
 */
export function inProgramTab(program: ProgramRow, tab: ProgramTab): boolean {
  const rank = stageRank(program.verificationStage)
  if (tab === 'review') return rank <= 1
  if (tab === 'drafts') return rank === 2 && program._status === 'draft'
  return true
}

/** Urgent first, then needing review, then the rest; finished last. Newest edit first within a rank. */
export function sortPrograms<T extends ProgramRow>(programs: T[]): T[] {
  return [...programs].sort(
    (a, b) =>
      stageRank(a.verificationStage) - stageRank(b.verificationStage) ||
      b.updatedAt.localeCompare(a.updatedAt),
  )
}

/** One page of `items`, in Payload's own paginated shape; a page past the end clamps to the last. */
export function paginate<T>(items: T[], page: number, limit: number): PaginatedDocs<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / limit))
  const current = Math.min(page, totalPages)
  return {
    docs: items.slice((current - 1) * limit, current * limit),
    totalDocs: items.length,
    limit,
    page: current,
    totalPages,
    pagingCounter: (current - 1) * limit + 1,
    hasPrevPage: current > 1,
    hasNextPage: current < totalPages,
    prevPage: current > 1 ? current - 1 : null,
    nextPage: current < totalPages ? current + 1 : null,
  }
}

export type ProgramStatus = 'finished' | 'review' | 'published' | 'draft'

/** The pill a program shows; it agrees with the tab that lists it. */
export function programStatus(program: Program): ProgramStatus {
  if (program.verificationStage === 'finished') return 'finished'
  if (stageRank(program.verificationStage) <= 1) return 'review'
  return program.published ? 'published' : 'draft'
}
