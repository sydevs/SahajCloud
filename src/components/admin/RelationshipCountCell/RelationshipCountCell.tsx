import type { CollectionConfig, DefaultServerCellComponentProps, JoinField } from 'payload'

import Link from 'next/link'

/**
 * Join field cell data structure
 */
interface JoinFieldData {
  docs: Array<{ id: string | number }>
  totalDocs?: number
  limit?: number
}

/**
 * Extract string label from PayloadCMS label type (string | function | object)
 */
function extractLabel(label: unknown): string | null {
  if (!label) return null
  if (typeof label === 'string') return label.toLowerCase()
  if (typeof label === 'object' && label !== null && 'en' in label) {
    return ((label as Record<string, string>).en ?? '').toLowerCase()
  }
  return null
}

/**
 * Get the display label for a count, using collection labels or field name
 */
function getLabel(
  count: number,
  collectionLabels: CollectionConfig['labels'] | undefined,
  fieldName?: string,
): string {
  // Use collection labels if available
  if (collectionLabels) {
    const rawLabel = count === 1 ? collectionLabels.singular : collectionLabels.plural
    const label = extractLabel(rawLabel)
    if (label) return label
  }

  // Fallback to field name with simple pluralization
  const name = fieldName ?? 'items'
  if (count === 1 && name.endsWith('s')) {
    return name.slice(0, -1)
  }
  return name
}

/**
 * RelationshipCountCell Component
 *
 * Displays the count of related documents for join fields in list views.
 * Shows a numeric count with pluralized collection name (e.g., "5 pages", "1 track")
 * and navigates to filtered collection list when clicked.
 */
export const RelationshipCountCell: React.FC<DefaultServerCellComponentProps> = ({
  cellData,
  rowData,
  field,
  payload,
}) => {
  const joinField = field as JoinField

  // Extract count from join field data
  // Use totalDocs for accurate count (docs.length may be limited by pagination)
  const joinData = cellData as JoinFieldData | null
  const count = joinData?.totalDocs ?? 0

  // Get field configuration for navigation
  const targetCollectionSlug = Array.isArray(joinField?.collection)
    ? joinField.collection[0]
    : joinField?.collection
  const relationField = joinField?.on
  const documentId = rowData?.id

  // Get target collection's labels from payload config
  const targetCollection = targetCollectionSlug ? payload.collections[targetCollectionSlug] : null
  const collectionLabels = targetCollection?.config?.labels

  // Get display label
  const label = getLabel(count, collectionLabels, joinField?.name)

  // Build navigation URL
  const href =
    targetCollectionSlug && relationField && documentId
      ? `/admin/collections/${targetCollectionSlug}?where[${relationField}][in][]=${documentId}`
      : null

  // Empty state
  if (count === 0) {
    return <span style={{ color: 'var(--theme-elevation-400)' }}>0 {label}</span>
  }

  // No valid URL - just show count
  if (!href) {
    return (
      <span>
        {count} {label}
      </span>
    )
  }

  return (
    <Link href={href} title={`View ${count} ${label}`}>
      {count} {label}
    </Link>
  )
}

export default RelationshipCountCell
