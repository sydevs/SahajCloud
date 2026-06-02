import { CleanupOrphanedMedia } from './CleanupOrphanedMedia'
import { SyncLectureMetadata } from './SyncLectureMetadata'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [CleanupOrphanedMedia, SyncLectureMetadata]
