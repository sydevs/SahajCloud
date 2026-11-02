import type { PaginatedDocs } from 'payload'

import type { RegistrationAnswer } from '@/lib/registrations/questions'
import type { UserSubmission } from '@/payload-types'

import { firstParam, pageParam } from '../helpers/searchParams'

/**
 * What the loader reads and the table renders: the one shape both sides import.
 *
 * It is a leaf on purpose — the view is a client component, and the loader
 * reaches `zod` and the whole notifications tree through its own imports.
 */

export const REGISTRATION_FILTERS = ['active', 'withdrawn'] as const
export type RegistrationFilter = (typeof REGISTRATION_FILTERS)[number]

export type RegistrationQuery = { filter: RegistrationFilter; page: number }

/**
 * One registrant, from the registration row's own columns.
 *
 * ⚠ `name`, `email` and every answer are text the visitor typed, so a renderer
 * must escape them and must never put one in an `href`
 * (`submissionData.ts`, `URL_EXEMPT_KEYS`).
 */
export type RegistrationRow = {
  id: number
  name: string
  email: string
  /** Formatted, because only the server knows the event's timezone. */
  registeredOn: string
  /** Which occurrence they are attending, where the row names one. */
  attending: string | null
  status: UserSubmission['status']
  answers: RegistrationAnswer[]
}

export type EventRegistrationsData = {
  filter: RegistrationFilter
  registrations: PaginatedDocs<RegistrationRow>
}

/** The view's URL state; anything unrecognised falls back to the first active page. */
export function parseRegistrationQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): RegistrationQuery {
  const filter = REGISTRATION_FILTERS.find(
    (candidate) => candidate === firstParam(searchParams, 'filter'),
  )
  return { filter: filter ?? 'active', page: pageParam(searchParams) }
}
