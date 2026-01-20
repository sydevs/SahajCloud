import { CleanupOrphanedMedia } from './tasks/CleanupOrphanedMedia'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [CleanupOrphanedMedia]
