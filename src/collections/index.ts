import { Clients } from './access/Clients'
import { Managers } from './access/Managers'
import { Albums } from './content/Albums'
import { AppCards } from './content/AppCards'
import { Lessons } from './content/Lessons'
import { Meditations } from './content/Meditations'
import { Pages } from './content/Pages'
import { Songs } from './content/Songs'
import { Videos } from './content/Videos'
import { Authors } from './resources/Authors'
import { Images } from './resources/Images'
import { LectureClips } from './resources/LectureClips'
import { Lectures } from './resources/Lectures'
import { Narrators } from './resources/Narrators'
import { Files } from './system/Files'
import { Frames } from './system/Frames'
import { Audiences } from './tags/Audiences'
import { SongTags } from './tags/SongTags'
import { SubtleSystemNodes } from './tags/SubtleSystemNodes'
import { UserChoices } from './tags/UserChoices'

// Export all collections as an array
export const collections = [
  // Content
  Pages,
  Meditations,
  Songs,
  Albums,
  Videos,
  Lessons,
  // Resources
  Lectures,
  LectureClips,
  Frames,
  Narrators,
  Authors,
  Images,
  Files,
  // Tags
  Audiences,
  UserChoices,
  SubtleSystemNodes,
  SongTags,
  // Access
  Managers,
  Clients,
  // Project-specific
  AppCards,
]

export {
  // Content
  Pages,
  Meditations,
  Songs,
  Albums,
  Videos,
  Lessons,
  // Resources
  Lectures,
  LectureClips,
  Frames,
  Narrators,
  Authors,
  Images,
  Files,
  // Tags
  Audiences,
  UserChoices,
  SubtleSystemNodes,
  SongTags,
  // Access
  Managers,
  Clients,
  // Project-specific
  AppCards,
}
