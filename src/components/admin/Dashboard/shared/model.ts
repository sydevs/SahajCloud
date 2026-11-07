import type { PaginatedDocs } from 'payload'

import type { OpenItemFilter } from '@/lib/atlasOverview/filters'
import { OPEN_ITEM_FILTERS } from '@/lib/atlasOverview/filters'
import type { OpenItemRow, OpenItemStatus, OverviewProgress } from '@/lib/atlasOverview/status'

import { firstParam, pageParam } from '../../helpers/searchParams'

/** One open-item row, flattened to what a client view can be handed. */
export interface OpenItemsRow {
  /** Unique across the row kinds a list mixes, which share an id space. */
  id: string
  kind: OpenItemRow['kind']
  title: string
  /** When an event meets; empty for a submission. */
  subtitle: string
  href: string
  statuses: Pick<OpenItemStatus, 'key' | 'label' | 'pill'>[]
  /** The placing status's line, the one that says why the row is where it is. */
  line: string
  action: null | { href: string; label: string }
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
 * ⚠ **A `type`, not an `interface`**: only a type literal satisfies
 * `useSetQuery`'s `Record<string, …>` constraint without an explicit index
 * signature, and that signature would accept every misspelled key.
 */
export type DashboardQuery = {
  filter: OpenItemTab
  limit: number
  page: number
  /** The region a region home is scoped to, from `?region=`. */
  region: number
  section: DashboardSection
}

/** The home's URL state: all of it lives in the query, so Back works and a link is shareable. */
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

/**
 * A section tab's link. It keeps the rest of the query — `region` above all,
 * or a region home falls back to the reader's whole scope — and drops `page`,
 * which belongs to the section being left.
 */
export function sectionHref(search: string, section: DashboardSection): string {
  const params = new URLSearchParams(search)
  params.set('section', section)
  params.delete('page')
  return `?${params.toString()}`
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
