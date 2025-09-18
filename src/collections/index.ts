import { Managers } from './access/Managers'
import { Media } from './resources/Media'
import { Films } from './content/Films'
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
import { Files } from './resources/Files'

// Export all collections as an array
export const collections = [
  // Content
  Pages,
  Meditations,
  LessonUnits,
  Lessons,
  // Resources
  Music,
  Films,
  Frames,
  Narrators,
  Media,
  Files,
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
  LessonUnits,
  Lessons,
  // Resources
  Music,
  Films,
  Frames,
  Narrators,
  Media,
  Files,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  // Access
  Managers,
  Clients,
}
