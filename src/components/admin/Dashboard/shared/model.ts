import type { PaginatedDocs } from 'payload'

import type { OpenItemFilter, OpenItemPill, OpenItemStatusKey } from '@/lib/atlasOverview/filters'
import { OPEN_ITEM_FILTERS } from '@/lib/atlasOverview/filters'
import type { OverviewProgress } from '@/lib/atlasOverview/status'

import { firstParam, pageParam } from '../../helpers/searchParams'

/**
 * One open-item row, flattened to what a client view can be handed.
 *
 * ⚠ **An index signature, because Payload's `Table` takes `Record<string,
 * unknown>[]` as its `data`.** It reads nothing off a row but `id`; the
 * declared members are what the cells are built from.
 */
export interface OpenItemsRow {
  [key: string]: unknown
  /** Unique across the row kinds a list mixes, which share an id space. */
  id: string
  title: string
  href: string
  statuses: {
    key: OpenItemStatusKey
    label: string
    pill: OpenItemPill
    line: string
  }[]
  action: null | { href: string; label: string }
  filters: OpenItemFilter[]
}

/** The filter row's values: every filter, plus All and the region scope's own. */
export const OPEN_ITEM_TABS = ['all', ...OPEN_ITEM_FILTERS, 'mine'] as const
export type OpenItemTab = (typeof OPEN_ITEM_TABS)[number]

export const PAGE_LIMITS = [10, 25, 50, 100]
const DEFAULT_LIMIT = 50

/** The section a home is showing — its own tabs, not the filter row's. */
export const DASHBOARD_SECTIONS = ['items', 'regions'] as const
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number]

/**
 * ⚠ **An index signature, because `useSetQuery<Q>` demands one.** The hook is
 * generic over `Record<string, number | string>` so a misspelled key is a build
 * error; a closed interface does not satisfy that constraint, and the named
 * members are still what typo-checks.
 */
export interface DashboardQuery {
  [key: string]: number | string
  filter: OpenItemTab
  limit: number
  page: number
  /** The region a region home is scoped to, from `?region=`. */
  region: number
  section: DashboardSection
}

/**
 * The home's URL state.
 *
 * ⚠ **Every piece of it lives in the query**, so Back works, a link is
 * shareable and the server renders the answer — the same contract
 * `parseProgramQuery` had, widened to the section and the region.
 */
export function parseDashboardQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): DashboardQuery {
  const filter = OPEN_ITEM_TABS.find(
    (candidate) => candidate === firstParam(searchParams, 'filter'),
  )
  const section = DASHBOARD_SECTIONS.find(
    (candidate) => candidate === firstParam(searchParams, 'section'),
  )
  const limit = PAGE_LIMITS.find(
    (candidate) => String(candidate) === firstParam(searchParams, 'limit'),
  )
  const region = Number.parseInt(firstParam(searchParams, 'region') ?? '', 10)
  return {
    filter: filter ?? 'all',
    limit: limit ?? DEFAULT_LIMIT,
    page: pageParam(searchParams),
    region: Number.isFinite(region) && region > 0 ? region : 0,
    section: section ?? 'items',
  }
}

/** One page of `items`, in Payload's own paginated shape; a page past the end clamps. */
export function paginate<T>(items: T[], page: number, limit: number): PaginatedDocs<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / limit))
  const current = Math.min(page, totalPages)
  return {
    docs: items.slice((current - 1) * limit, current * limit),
    hasNextPage: current < totalPages,
    hasPrevPage: current > 1,
    limit,
    nextPage: current < totalPages ? current + 1 : null,
    page: current,
    pagingCounter: (current - 1) * limit + 1,
    prevPage: current > 1 ? current - 1 : null,
    totalDocs: items.length,
    totalPages,
  }
}

/** What an open-items list needs, whichever home renders it. */
export interface OpenItemsData {
  counts: { all: number; mine: number } & Record<OpenItemFilter, number>
  progress: null | OverviewProgress
  query: DashboardQuery
  rows: PaginatedDocs<OpenItemsRow>
}
