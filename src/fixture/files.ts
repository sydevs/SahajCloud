import { ID } from './ids'
import { fixture } from './types'

export default fixture('files', [
  {
    id: ID.files.pdf,
    file: 'fixture-guide.pdf',
    data: {},
  },
  // Audio a transcript belongs to.
  {
    id: ID.files.audio,
    file: 'fixture-audio.mp3',
    data: { spokenLanguage: 'en' },
  },
  {
    id: ID.files.image,
    file: 'fixture-wide.webp',
    data: {},
  },
  // A recording with no stated language, which a transcription run would detect.
  {
    id: 1_005_010,
    file: 'fixture-audio.mp3',
    data: {},
  },
])
