import { CleanupOrphanedMedia } from './tasks/CleanupOrphanedMedia'
import { ResetUsage, TrackUsage } from './tasks/TrackUsage'

// Export all tasks as an array
export const tasks = [ResetUsage, TrackUsage, CleanupOrphanedMedia]
