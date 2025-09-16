import { Managers } from './access/Managers'
import { Media } from './resources/Media'
import { Narrators } from './resources/Narrators'
import { Meditations } from './content/Meditations'
import { Music } from './content/Music'
import { Pages } from './content/Pages'
import { Lessons } from './content/Lessons'
import { LessonUnits } from './tags/LessonUnits'
import { Frames } from './resources/Frames'
import { Clients } from './access/Clients'
import { MeditationTags } from './tags/MeditationTags'
import { MediaTags } from './tags/MediaTags'
import { MusicTags } from './tags/MusicTags'

// Export all collections as an array
export const collections = [
  // Content
  Meditations,
  Music,
  Pages,
  Lessons,
  Frames,
  // Resources
  Media,
  Narrators,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  LessonUnits,
  // Access
  Managers,
  Clients,
]

export {
  // Content
  Meditations,
  Music,
  Pages,
  Lessons,
  Frames,
  // Resources
  Media,
  Narrators,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  LessonUnits,
  // Access
  Managers,
  Clients,
}
