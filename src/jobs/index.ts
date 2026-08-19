import { CleanupOrphanedMedia } from './CleanupOrphanedMedia/CleanupOrphanedMedia'
import { ExpireEvents } from './ExpireEvents/ExpireEvents'
import { SendRegistrationDigests } from './RegistrationNotifications/SendRegistrationDigests'
import { SendSessionReminders } from './RegistrationNotifications/SendSessionReminders'
import { SyncLectureMetadata } from './SyncLectureMetadata/SyncLectureMetadata'
import { VerifyEmbeds } from './VerifyEmbeds/VerifyEmbeds'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [
  CleanupOrphanedMedia,
  ExpireEvents,
  SendRegistrationDigests,
  SendSessionReminders,
  SyncLectureMetadata,
  VerifyEmbeds,
]
