import { Managers } from './access/Managers'
import { Media } from './resources/Media'
import { ExternalVideos } from './resources/ExternalVideos'
import { Narrators } from './resources/Narrators'
import { Meditations } from './content/Meditations'
import { Music } from './content/Music'
import { Pages } from './content/Pages'
import { Lessons } from './content/Lessons'
import { Frames } from './system/Frames'
import { Clients } from './access/Clients'
import { MeditationTags } from './tags/MeditationTags'
import { MediaTags } from './tags/MediaTags'
import { MusicTags } from './tags/MusicTags'
import { FileAttachments } from './system/FileAttachments'

// Export all collections as an array
export const collections = [
  // Content
  Pages,
  Meditations,
  Lessons,
  // Resources
  Music,
  ExternalVideos,
  Frames,
  Narrators,
  Media,
  FileAttachments,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  // Access
  Managers,
  Clients,
]

export {
  // Content
  Pages,
  Meditations,
  Lessons,
  // Resources
  Music,
  ExternalVideos,
  Frames,
  Narrators,
  Media,
  FileAttachments,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  // Access
  Managers,
  Clients,
}
