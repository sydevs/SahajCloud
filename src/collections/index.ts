import { Users } from './access/Users'
import { Media } from './resources/Media'
import { Narrators } from './resources/Narrators'
import { Meditations } from './content/Meditations'
import { Tags } from './resources/Tags'
import { Music } from './content/Music'
import { Frames } from './resources/Frames'
import { Clients } from './access/Clients'

// Export all collections as an array
export const collections = [
  // Content
  Meditations,
  Music,
  Frames,
  // Resources
  Media,
  Narrators,
  Tags,
  // Access
  Users,
  Clients,
]

export {
  Users,
  Media,
  Narrators,
  Meditations,
  Tags,
  Music,
  Frames,
  Clients,
}
