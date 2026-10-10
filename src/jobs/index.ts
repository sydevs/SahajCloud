import { CleanupOrphanedMedia } from './CleanupOrphanedMedia/CleanupOrphanedMedia'
import { CommitEventImport } from './CommitEventImport/CommitEventImport'
import { DeliverSubmissions } from './DeliverSubmissions/DeliverSubmissions'
import { ExpireEvents } from './ExpireEvents/ExpireEvents'
import { PurgeSubmissions } from './PurgeSubmissions/PurgeSubmissions'
import { SendPostEventFollowUps } from './RegistrationNotifications/SendPostEventFollowUps'
import { SendRegistrationDigests } from './RegistrationNotifications/SendRegistrationDigests'
import { SendSessionReminders } from './RegistrationNotifications/SendSessionReminders'
import { ResolveEventImport } from './ResolveEventImport/ResolveEventImport'
import { ScreenSubmissions } from './ScreenSubmissions/ScreenSubmissions'
import { SweepEventImports } from './SweepEventImports/SweepEventImports'
import { SyncLectureMetadata } from './SyncLectureMetadata/SyncLectureMetadata'
import { VerifyEmbeds } from './VerifyEmbeds/VerifyEmbeds'

// Export all tasks as an array
// Note: TrackUsage and ResetUsage tasks are auto-registered by the usagePlugin
export const tasks = [
  CleanupOrphanedMedia,
  CommitEventImport,
  DeliverSubmissions,
  ExpireEvents,
  PurgeSubmissions,
  ResolveEventImport,
  ScreenSubmissions,
  SendPostEventFollowUps,
  SendRegistrationDigests,
  SendSessionReminders,
  SweepEventImports,
  SyncLectureMetadata,
  VerifyEmbeds,
]
