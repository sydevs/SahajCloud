import { CleanupOrphanedMedia } from './tasks/CleanupOrphanedMedia'
import { SyncLectureMetadata } from './tasks/SyncLectureMetadata'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [CleanupOrphanedMedia, SyncLectureMetadata]
