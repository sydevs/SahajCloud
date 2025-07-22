import { Users } from './Users'
import { Media } from './Media'
import { Narrators } from './Narrators'
import { Meditations } from './Meditations'
import { Tags } from './Tags'
import { Music } from './Music'
import { Frames } from './Frames'
import { MeditationFrames } from './MeditationFrames'

// Export all collections as an array
export const collections = [
  Users,
  Media,
  Narrators,
  Meditations,
  Tags,
  Music,
  Frames,
  MeditationFrames,
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