import { CleanupOrphanedMedia } from './CleanupOrphanedMedia/CleanupOrphanedMedia'
import { ExpireEvents } from './ExpireEvents/ExpireEvents'
import { SyncLectureMetadata } from './SyncLectureMetadata/SyncLectureMetadata'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [CleanupOrphanedMedia, ExpireEvents, SyncLectureMetadata]
