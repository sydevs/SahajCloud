import { Clients } from './access/Clients'
import { Managers } from './access/Managers'
import { Lessons } from './content/Lessons'
import { Meditations } from './content/Meditations'
import { Music } from './content/Music'
import { Pages } from './content/Pages'
import { Authors } from './resources/Authors'
import { ExternalVideos } from './resources/ExternalVideos'
import { Media } from './resources/Media'
import { Narrators } from './resources/Narrators'
import { FileAttachments } from './system/FileAttachments'
import { Frames } from './system/Frames'
import { MediaTags } from './tags/MediaTags'
import { MeditationTags } from './tags/MeditationTags'
import { MusicTags } from './tags/MusicTags'
import { PageTags } from './tags/PageTags'

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
  Authors,
  Media,
  FileAttachments,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  PageTags,
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
  Authors,
  Media,
  FileAttachments,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  PageTags,
  // Access
  Managers,
  Clients,
}
