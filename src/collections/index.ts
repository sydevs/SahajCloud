import { Users } from './access/Users'
import { Media } from './resources/Media'
import { Narrators } from './resources/Narrators'
import { Meditations } from './content/Meditations'
import { Music } from './content/Music'
import { Articles } from './content/Articles'
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
  Articles,
  Frames,
  // Resources
  Media,
  Narrators,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  // Access
  Users,
  Clients,
]

export {
  // Content
  Meditations,
  Music,
  Articles,
  Frames,
  // Resources
  Media,
  Narrators,
  // Tags
  MediaTags,
  MeditationTags,
  MusicTags,
  // Access
  Users,
  Clients,
}
