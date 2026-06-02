import type { Block, FieldHook } from 'payload'

import { extractID } from 'payload/shared'

import { PAGE_TAGS } from '@/lib/constants'

/**
 * Configuration for each content type's API endpoint generation.
 * `filterField` / `queryParam` are optional — `lectures` hits `/for-audience`,
 * which evaluates audiences from runtime user context and ignores `where`.
 */
const CONTENT_TYPE_CONFIG: Record<
  string,
  { basePath: string; filterField?: string; queryParam?: string; extraParams?: string }
> = {
  meditations: {
    basePath: '/api/user-choices',
    filterField: 'userChoiceFilters',
    queryParam: 'where[id][in]',
    extraParams: '&depth=1',
  },
  pages: {
    basePath: '/api/pages',
    filterField: 'pageFilters',
    queryParam: 'where[tags][in]',
  },
  songs: {
    basePath: '/api/songs',
    filterField: 'songFilters',
    queryParam: 'where[tags][in]',
  },
  lectures: {
    basePath: '/api/lectures/for-audience',
  },
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
    typeof rawLimit === 'number' &&
    Number.isInteger(rawLimit) &&
    rawLimit >= 1 &&
    rawLimit <= 100
      ? rawLimit
      : null
  if (limit === null) return null

  if (config.filterField && config.queryParam) {
    const filters = siblingData?.[config.filterField]
    if (!filters || (Array.isArray(filters) && filters.length === 0)) return null

    const filterValues = (Array.isArray(filters) ? filters : [filters]).filter(Boolean)
    const ids = filterValues.map(extractID)
    if (ids.length === 0) return null

    const queryValue = ids.map((id) => encodeURIComponent(id)).join(',')
    let url = `${config.basePath}?${config.queryParam}=${queryValue}`
    if (config.extraParams) url = `${url}${config.extraParams}`
    return `${url}&limit=${limit}`
  }

  // No filter field → limit is the first query param
  return `${config.basePath}?limit=${limit}`
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
