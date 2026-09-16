import { CleanupOrphanedMedia } from './CleanupOrphanedMedia/CleanupOrphanedMedia'
import { DeliverSubmissions } from './DeliverSubmissions/DeliverSubmissions'
import { ExpireEvents } from './ExpireEvents/ExpireEvents'
import { PurgeSubmissions } from './PurgeSubmissions/PurgeSubmissions'
import { PurgeUserMessages } from './PurgeUserMessages/PurgeUserMessages'
import { SendPostEventFollowUps } from './RegistrationNotifications/SendPostEventFollowUps'
import { SendRegistrationDigests } from './RegistrationNotifications/SendRegistrationDigests'
import { SendSessionReminders } from './RegistrationNotifications/SendSessionReminders'
import { ScreenEventSubmissions } from './ScreenEventSubmissions/ScreenEventSubmissions'
import { ScreenSubmissions } from './ScreenSubmissions/ScreenSubmissions'
import { ScreenUserMessages } from './ScreenUserMessages/ScreenUserMessages'
import { SyncLectureMetadata } from './SyncLectureMetadata/SyncLectureMetadata'
import { VerifyEmbeds } from './VerifyEmbeds/VerifyEmbeds'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [
  CleanupOrphanedMedia,
  DeliverSubmissions,
  ExpireEvents,
  PurgeSubmissions,
  PurgeUserMessages,
  ScreenEventSubmissions,
  ScreenSubmissions,
  ScreenUserMessages,
  SendPostEventFollowUps,
  SendRegistrationDigests,
  SendSessionReminders,
  SyncLectureMetadata,
  VerifyEmbeds,
]
