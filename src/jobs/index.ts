import { CleanupOrphanedFiles } from './tasks/CleanupOrphanedFiles'
import { ResetUsage, TrackUsage } from './tasks/TrackUsage'

// Export all collections as an array
export const tasks = [
  ResetUsage,
  TrackUsage,
  CleanupOrphanedFiles,
]
