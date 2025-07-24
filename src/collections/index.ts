import { Users } from './Users'
import { Media } from './Media'
import { Narrators } from './Narrators'
import { Meditations } from './Meditations'
import { Tags } from './Tags'
import { Music } from './Music'
import { Frames } from './Frames'
import { MeditationFrames } from './MeditationFrames'
import { Clients } from './Clients'

// Export all collections as an array
export const collections = [
  // Resources
  Meditations,
  Music,
  Frames,
  MeditationFrames,
  // Utility
  Media,
  Narrators,
  Users,
  Clients,
  Tags,
]

// Re-export each collection individually
export { Users } from './Users'
export { Media } from './Media'
export { Narrators } from './Narrators'
export { Meditations } from './Meditations'
export { Tags } from './Tags'
export { Music } from './Music'
export { Frames } from './Frames'
export { MeditationFrames } from './MeditationFrames'
export { Clients } from './Clients'