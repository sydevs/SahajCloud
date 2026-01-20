import { Clients } from './access/Clients'
import { Managers } from './access/Managers'
import { Albums } from './content/Albums'
import { Lessons } from './content/Lessons'
import { Meditations } from './content/Meditations'
import { Music } from './content/Music'
import { Pages } from './content/Pages'
import { Videos } from './content/Videos'
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
import { VideoTags } from './tags/VideoTags'

// Export all collections as an array
export const collections = [
  // Content
  Pages,
  Meditations,
  Music,
  Albums,
  Videos,
  Lessons,
  // Resources
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
  VideoTags,
  // Access
  Managers,
  Clients,
]

export {
  // Content
  Pages,
  Meditations,
  Music,
  Albums,
  Videos,
  Lessons,
  // Resources
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
  VideoTags,
  // Access
  Managers,
  Clients,
}
