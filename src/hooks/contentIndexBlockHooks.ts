import type { FieldHook } from 'payload'

/**
 * Extract an ID from a filter value that may be a raw ID (number/string) or a populated object.
 */
function extractId(value: unknown): string | number | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return (value as { id: string | number }).id
  }
  return null
}

/**
 * Configuration for each content type's API endpoint generation.
 */
const CONTENT_TYPE_CONFIG: Record<
  string,
  { basePath: string; filterField: string; queryParam: string }
> = {
  meditations: {
    basePath: '/api/meditation-tags',
    filterField: 'meditationFilters',
    queryParam: 'where[id][in]',
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
    basePath: '/api/lectures',
    filterField: 'lectureFilters',
    queryParam: 'where[tags][in]',
  },
}

/**
 * afterRead hook for the virtual `apiEndpoint` field on ContentIndexBlock.
 * Computes a ready-to-use API endpoint URL from the block's type and selected filters.
 */
export const computeApiEndpoint: FieldHook = ({ siblingData }) => {
  const type = siblingData?.type as string | undefined
  if (!type) return null

  const config = CONTENT_TYPE_CONFIG[type]
  if (!config) return null

  const filters = siblingData?.[config.filterField]
  if (!filters || (Array.isArray(filters) && filters.length === 0)) return null

  const filterValues = Array.isArray(filters) ? filters : [filters]
  const ids = filterValues.map(extractId).filter((id): id is string | number => id !== null)

  if (ids.length === 0) return null

  const queryValue = ids.join(',')
  const endpoint = `${config.basePath}?${config.queryParam}=${queryValue}`

  // Meditations query meditation-tags, so add depth=1 to populate related data
  if (type === 'meditations') {
    return `${endpoint}&depth=1`
  }

  return endpoint
}
