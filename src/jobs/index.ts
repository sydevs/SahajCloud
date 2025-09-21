import { ResetUsage, TrackUsage } from './tasks/TrackUsage'
import { CleanupOrphanedFiles } from './tasks/CleanupOrphanedFiles'

// Export all collections as an array
export const tasks = [
  ResetUsage,
  TrackUsage,
  CleanupOrphanedFiles,
]
