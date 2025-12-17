import type { Frame } from '@/payload-types'

/**
 * Minimal frame data stored in the meditation's frames JSON field.
 * Contains only the frame ID and timestamp for efficient storage.
 */
export type KeyframeDefinition = {
  id: number | string
  timestamp: number
}

/**
 * Enriched frame data returned from afterRead hook.
 * Combines KeyframeDefinition with full Frame document data.
 * Uses Omit to handle id type mismatch (Frame.id is string, KeyframeDefinition.id is string | number)
 */
export type KeyframeData = Omit<Partial<Frame>, 'id'> & KeyframeDefinition
