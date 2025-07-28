import { Users } from './Users'
import { Media } from './Media'
import { Narrators } from './Narrators'
import { Meditations } from './Meditations'
import { Tags } from './Tags'
import { Music } from './Music'
import { Frames } from './Frames'
import { Clients } from './Clients'

// Export all collections as an array
export const collections = [
  // Resources
  Meditations,
  Music,
  Frames,
  // Utility
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
