import type { Block, FieldHook } from 'payload'

import { extractID } from 'payload/shared'

import { PAGE_TAGS } from '@/lib/pageTags'
import { USER_CHOICE_TYPES } from '@/lib/userChoices'

/** The `userChoiceFeatured` options, each with the `where` clause it contributes. */
const USER_CHOICE_FEATURED: { label: string; value: string; where: string | null }[] = [
  { label: 'Featured only', value: 'featured', where: 'where[isFeatured][equals]=true' },
  { label: 'Not featured', value: 'not-featured', where: 'where[isFeatured][equals]=false' },
  { label: 'All', value: 'all', where: null },
]

/** Builds every clause of a type's endpoint before `limit`, or null to publish none. */
type ParamsBuilder = (siblingData: Record<string, unknown>) => string | null

/**
 * Where each content type's list lives, and how its filters reach the query.
 *
 * One mechanism, so an entry cannot half-declare two: every filtered type
 * names a `ParamsBuilder`, and `lectures` names none because
 * `/for-audience` evaluates audiences from runtime user context and ignores
 * `where`. A builder joins its own clauses, never the separator around them —
 * `computeApiEndpoint` owns that, which is what lets `lectures` come out as
 * `?limit=n` rather than `?&limit=n`.
 */
const CONTENT_TYPE_CONFIG: Record<string, { basePath: string; params?: ParamsBuilder }> = {
  meditations: {
    basePath: '/api/user-choices',
    params: inListParams('userChoiceFilters', 'where[id][in]', 'depth=1'),
  },
  pages: {
    basePath: '/api/pages',
    params: inListParams('pageFilters', 'where[tags][in]'),
  },
  songs: {
    basePath: '/api/songs',
    params: inListParams('songFilters', 'where[tags][in]'),
  },
  lectures: {
    basePath: '/api/lectures/for-audience',
  },
  'user-choices': {
    basePath: '/api/user-choices',
    params: userChoiceParams,
  },
}

/** A type filtered by one relationship or select field, as a comma-joined `in` clause. */
function inListParams(filterField: string, queryParam: string, extra?: string): ParamsBuilder {
  return (siblingData) => {
    const raw = siblingData[filterField]
    const ids = (Array.isArray(raw) ? raw : [raw])
      .filter(Boolean)
      .map((value) => encodeURIComponent(extractID(value)))
    if (ids.length === 0) return null

    return [`${queryParam}=${ids.join(',')}`, extra].filter(Boolean).join('&')
  }
}

/**
 * The `user-choices` clauses: the chosen kinds, the featured setting, and two
 * fixed ones. `isParent` is excluded because a parent category names no
 * meditation of its own, so a tile for one could only lead nowhere. The second
 * sort key is a tie-break: `order` is not unique (three of production's
 * featured moods share `order: 1`), and without it Postgres may return tied
 * rows in a different order on each read, so the grid would reshuffle between
 * page loads. `id` rather than `title` keeps that order the same in every
 * locale. Payload splits a comma-joined `sort` into keys (3.93,
 * `sanitizeSortParams`).
 */
function userChoiceParams(siblingData: Record<string, unknown>): string | null {
  const raw = siblingData.userChoiceTypeFilters
  const types = (Array.isArray(raw) ? raw : []).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  if (types.length === 0) return null

  const option = USER_CHOICE_FEATURED.find(({ value }) => value === siblingData.userChoiceFeatured)
  if (!option) return null

  const kinds = types.map((type) => encodeURIComponent(type)).join(',')

  return [
    `where[type][in]=${kinds}`,
    option.where,
    'where[isParent][equals]=false',
    'sort=order,id',
  ]
    .filter(Boolean)
    .join('&')
}

/**
 * afterRead hook for the virtual `apiEndpoint` field.
 * Computes a ready-to-use API endpoint URL from the block's type, selected filters, and limit.
 */
export const computeApiEndpoint: FieldHook = ({ siblingData }) => {
  const type = siblingData?.type as string | undefined
  if (!type) return null

  const config = CONTENT_TYPE_CONFIG[type]
  if (!config) return null

  const rawLimit = siblingData?.limit
  const limit =
    typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100
      ? rawLimit
      : null
  if (limit === null) return null

  const params = config.params ? config.params(siblingData as Record<string, unknown>) : ''
  if (params === null) return null

  return `${config.basePath}?${[params, `limit=${limit}`].filter(Boolean).join('&')}`
}

/**
 * Creates hooks that clear a filter field's value when the block's type doesn't match.
 * Prevents stale filter data from being stored or returned in the API.
 */
function clearWhenTypeNot(activeType: string): {
  beforeChange: FieldHook[]
  afterRead: FieldHook[]
} {
  const hook: FieldHook = ({ value, siblingData, field }) => {
    if (siblingData?.type === activeType) return value
    if (siblingData && field?.name) delete siblingData[field.name]
    return undefined
  }
  return { beforeChange: [hook], afterRead: [hook] }
}

export const ContentIndexBlock: Block = {
  slug: 'content-index',
  interfaceName: 'ContentIndexBlock',
  // Icon: Grid of document pages (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjYiIGhlaWdodD0iNyIgcng9IjAuNSIvPjxsaW5lIHgxPSIzLjUiIHkxPSI0IiB4Mj0iNi41IiB5Mj0iNCIvPjxsaW5lIHgxPSIzLjUiIHkxPSI2IiB4Mj0iNS41IiB5Mj0iNiIvPjxyZWN0IHg9IjEyIiB5PSIyIiB3aWR0aD0iNiIgaGVpZ2h0PSI3IiByeD0iMC41Ii8+PGxpbmUgeDE9IjEzLjUiIHkxPSI0IiB4Mj0iMTYuNSIgeTI9IjQiLz48bGluZSB4MT0iMTMuNSIgeTE9IjYiIHgyPSIxNS41IiB5Mj0iNiIvPjxyZWN0IHg9IjIiIHk9IjExIiB3aWR0aD0iNiIgaGVpZ2h0PSI3IiByeD0iMC41Ii8+PGxpbmUgeDE9IjMuNSIgeTE9IjEzIiB4Mj0iNi41IiB5Mj0iMTMiLz48bGluZSB4MT0iMy41IiB5MT0iMTUiIHgyPSI1LjUiIHkyPSIxNSIvPjxyZWN0IHg9IjEyIiB5PSIxMSIgd2lkdGg9IjYiIGhlaWdodD0iNyIgcng9IjAuNSIvPjxsaW5lIHgxPSIxMy41IiB5MT0iMTMiIHgyPSIxNi41IiB5Mj0iMTMiLz48bGluZSB4MT0iMTMuNSIgeTE9IjE1IiB4Mj0iMTUuNSIgeTI9IjE1Ii8+PC9zdmc+Cg==',
  labels: {
    singular: 'Content Index',
    plural: 'Content Indexes',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'meditations',
      options: [
        { label: 'Meditations', value: 'meditations' },
        { label: 'Pages', value: 'pages' },
        { label: 'Songs', value: 'songs' },
        { label: 'Lectures', value: 'lectures' },
        { label: 'User Choices', value: 'user-choices' },
      ],
      admin: {
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    {
      name: 'limit',
      type: 'number',
      required: true,
      defaultValue: 10,
      min: 1,
      max: 100,
      admin: {
        description: 'Maximum number of items to return (1–100)',
      },
    },
    {
      name: 'pageFilters',
      type: 'select',
      hasMany: true,
      required: true,
      options: PAGE_TAGS,
      hooks: clearWhenTypeNot('pages'),
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'pages',
        description: 'Select page tags to use as filters for this index grid',
      },
    },
    {
      name: 'userChoiceFilters',
      type: 'relationship',
      relationTo: 'user-choices',
      hasMany: true,
      minRows: 1,
      maxDepth: 0,
      hooks: clearWhenTypeNot('meditations'),
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'meditations',
        description: 'Select user choices to use as filters for this index grid',
      },
    },
    {
      name: 'userChoiceTypeFilters',
      type: 'select',
      hasMany: true,
      required: true,
      options: USER_CHOICE_TYPES,
      hooks: clearWhenTypeNot('user-choices'),
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'user-choices',
        description: 'Which kinds of user choice this index lists',
      },
    },
    {
      name: 'userChoiceFeatured',
      type: 'select',
      required: true,
      // No `defaultValue`: one here would undo `clearWhenTypeNot` (AGENTS.md, #1257).
      options: USER_CHOICE_FEATURED.map(({ label, value }) => ({ label, value })),
      hooks: clearWhenTypeNot('user-choices'),
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'user-choices',
        description: 'Whether to list the featured choices, the rest, or every one',
      },
    },
    {
      name: 'songFilters',
      type: 'relationship',
      relationTo: 'song-tags',
      hasMany: true,
      minRows: 1,
      maxDepth: 0,
      hooks: clearWhenTypeNot('songs'),
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'songs',
        description: 'Select music tags to use as filters for this index grid',
      },
    },
    {
      name: 'apiEndpoint',
      type: 'text',
      virtual: true,
      admin: { hidden: true },
      hooks: {
        afterRead: [computeApiEndpoint],
      },
    },
  ],
}
