import { CleanupOrphanedMedia } from './CleanupOrphanedMedia/CleanupOrphanedMedia'
import { DeliverSubmissions } from './DeliverSubmissions/DeliverSubmissions'
import { ExpireEvents } from './ExpireEvents/ExpireEvents'
import { PurgeSubmissions } from './PurgeSubmissions/PurgeSubmissions'
import { SendPostEventFollowUps } from './RegistrationNotifications/SendPostEventFollowUps'
import { SendRegistrationDigests } from './RegistrationNotifications/SendRegistrationDigests'
import { SendSessionReminders } from './RegistrationNotifications/SendSessionReminders'
import { ScreenSubmissions } from './ScreenSubmissions/ScreenSubmissions'
import { SyncLectureMetadata } from './SyncLectureMetadata/SyncLectureMetadata'
import { VerifyEmbeds } from './VerifyEmbeds/VerifyEmbeds'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [
  CleanupOrphanedMedia,
  DeliverSubmissions,
  ExpireEvents,
  PurgeSubmissions,
  ScreenSubmissions,
  SendPostEventFollowUps,
  SendRegistrationDigests,
  SendSessionReminders,
  SyncLectureMetadata,
  VerifyEmbeds,
]
