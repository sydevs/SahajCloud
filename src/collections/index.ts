import { Clients } from './access/Clients'
import { Managers } from './access/Managers'
import { Lessons } from './content/Lessons'
import { Meditations } from './content/Meditations'
import { Music } from './content/Music'
import { Pages } from './content/Pages'
import { Authors } from './resources/Authors'
import { Images } from './resources/Images'
import { Lectures } from './resources/Lectures'
import { Narrators } from './resources/Narrators'
import { Files } from './system/Files'
import { Frames } from './system/Frames'
import { ImageTags } from './tags/ImageTags'
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
  Lectures,
  Frames,
  Narrators,
  Authors,
  Images,
  Files,
  // Tags
  ImageTags,
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
  Lectures,
  Frames,
  Narrators,
  Authors,
  Images,
  Files,
  // Tags
  ImageTags,
  MeditationTags,
  MusicTags,
  PageTags,
  // Access
  Managers,
  Clients,
}
