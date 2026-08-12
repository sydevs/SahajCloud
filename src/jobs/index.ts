import { CleanupOrphanedMedia } from './CleanupOrphanedMedia/CleanupOrphanedMedia'
import { ExpireEvents } from './ExpireEvents/ExpireEvents'
import { SendPostEventFollowUps } from './RegistrationNotifications/SendPostEventFollowUps'
import { SendRegistrationDigests } from './RegistrationNotifications/SendRegistrationDigests'
import { SendSessionReminders } from './RegistrationNotifications/SendSessionReminders'
import { ScreenEventSubmissions } from './ScreenEventSubmissions/ScreenEventSubmissions'
import { SyncLectureMetadata } from './SyncLectureMetadata/SyncLectureMetadata'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [
  CleanupOrphanedMedia,
  ExpireEvents,
  ScreenEventSubmissions,
  SendPostEventFollowUps,
  SendRegistrationDigests,
  SendSessionReminders,
  SyncLectureMetadata,
]
