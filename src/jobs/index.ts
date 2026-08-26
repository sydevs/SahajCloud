import { CleanupOrphanedMedia } from './CleanupOrphanedMedia/CleanupOrphanedMedia'
import { ExpireEvents } from './ExpireEvents/ExpireEvents'
import { SendPostEventFollowUps } from './RegistrationNotifications/SendPostEventFollowUps'
import { SendRegistrationDigests } from './RegistrationNotifications/SendRegistrationDigests'
import { SendSessionReminders } from './RegistrationNotifications/SendSessionReminders'
import { ScreenEventSubmissions } from './ScreenEventSubmissions/ScreenEventSubmissions'
import { ScreenUserMessages } from './ScreenUserMessages/ScreenUserMessages'
import { SyncLectureMetadata } from './SyncLectureMetadata/SyncLectureMetadata'
import { VerifyEmbeds } from './VerifyEmbeds/VerifyEmbeds'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [
  CleanupOrphanedMedia,
  ExpireEvents,
  ScreenEventSubmissions,
  ScreenUserMessages,
  SendPostEventFollowUps,
  SendRegistrationDigests,
  SendSessionReminders,
  SyncLectureMetadata,
  VerifyEmbeds,
]
