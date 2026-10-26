import type { PaginatedDocs, Where } from 'payload'

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
export type AtlasDashboardData = {
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

/**
 * Each tab as a filter on the stored `verificationRank`, so it pages in the
 * database. Ranks 0 and 1 need the manager; a draft is a settled program that
 * has never gone live. Finished programs appear only under "all".
 */
export function programTabWhere(tab: ProgramTab): Where {
  if (tab === 'review') return { verificationRank: { less_than_equal: 1 } }
  if (tab === 'drafts') {
    return { and: [{ verificationRank: { equals: 2 } }, { _status: { equals: 'draft' } }] }
  }
  return {}
}

export type ProgramStatus = 'finished' | 'review' | 'published' | 'draft'

/** The pill a program shows; it agrees with the tab that lists it. */
export function programStatus(program: Program): ProgramStatus {
  if (program.verificationStage === 'finished') return 'finished'
  if (stageRank(program.verificationStage) <= 1) return 'review'
  return program.published ? 'published' : 'draft'
}
