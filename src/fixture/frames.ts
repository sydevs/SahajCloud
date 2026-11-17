import { FRAME, NODE } from './content-ids'
import { STREAM_CLIP } from './stream'
import { fixture, type FixtureData } from './types'

type FrameData = FixtureData<'frames'>

const image = (
  id: number,
  file: string,
  data: FrameData,
): { id: number; file: string; data: FrameData } => ({ id, file, data })

export default fixture('frames', [
  image(FRAME.mooladhara, 'fixture-square.png', {
    imageSet: 'male',
    label: 'Mooladhara, hand on the earth',
    subtleSystemNode: NODE.mooladhara,
    tags: ['earth', 'hand'],
  }),
  image(FRAME.swadhistan, 'fixture-landscape.jpg', {
    imageSet: 'female',
    label: 'Swadhistan, hands massaging',
    subtleSystemNode: NODE.swadhistan,
    tags: ['hands', 'massage'],
  }),
  image(FRAME.nabhi, 'fixture-wide.webp', {
    imageSet: 'male',
    label: 'Nabhi, right hand',
    subtleSystemNode: NODE.nabhi,
    tags: ['hand', 'righthanded'],
  }),
  image(FRAME.void, 'fixture-thumbnail.png', {
    imageSet: 'female',
    label: 'Void, both hands',
    subtleSystemNode: NODE.void,
    tags: ['both hands', 'hamsa'],
  }),
  image(FRAME.anahat, 'fixture-portrait.jpg', {
    imageSet: 'male',
    label: 'Anahat, feeling the heart',
    subtleSystemNode: NODE.anahat,
    tags: ['anahat', 'center', 'feel'],
  }),
  image(FRAME.vishuddhi, 'fixture-square.png', {
    imageSet: 'female',
    label: 'Vishuddhi, left handed',
    subtleSystemNode: NODE.vishuddhi,
    tags: ['left', 'lefthanded', 'ham ksham'],
  }),
  image(FRAME.agnya, 'fixture-landscape.jpg', {
    imageSet: 'male',
    label: 'Agnya, raising the hand',
    subtleSystemNode: NODE.agnya,
    tags: ['raise', 'ego', 'superego'],
  }),
  image(FRAME.sahasrara, 'fixture-wide.webp', {
    imageSet: 'female',
    label: 'Sahasrara, silent',
    subtleSystemNode: NODE.sahasrara,
    tags: ['silent', 'meditate'],
  }),
  image(FRAME.kundalini, 'fixture-thumbnail.png', {
    imageSet: 'male',
    label: 'Kundalini, clearing',
    subtleSystemNode: NODE.kundalini,
    tags: ['clearing', 'tapping'],
  }),
  image(FRAME.ida, 'fixture-portrait.jpg', {
    imageSet: 'female',
    label: 'Left channel',
    subtleSystemNode: NODE.ida,
    tags: ['left', 'channel', 'back'],
  }),
  image(FRAME.pingala, 'fixture-square.png', {
    imageSet: 'male',
    label: 'Right channel',
    subtleSystemNode: NODE.pingala,
    tags: ['right', 'channel', 'ready'],
  }),
  image(FRAME.sushumna, 'fixture-landscape.jpg', {
    imageSet: 'female',
    label: 'Central channel',
    subtleSystemNode: NODE.sushumna,
    tags: ['center', 'channel', 'rising'],
  }),
  // No node: the "Other" bucket, named by its label.
  image(FRAME.bandhan, 'fixture-wide.webp', {
    imageSet: 'male',
    label: 'Bandhan',
    tags: ['bandhan', 'hands', 'ready'],
  }),
  image(FRAME.namaste, 'fixture-thumbnail.png', {
    imageSet: 'female',
    label: 'Namaste',
    tags: ['namaste', 'silent', 'both hands'],
  }),
  // A Stream clip: the row exists beneath every hook because uploading would send a new clip to Stream.
  {
    id: FRAME.risingVideo,
    direct: 'Cloudflare Stream clip shared by every environment',
    data: {
      imageSet: 'male',
      label: 'Kundalini rising, moving',
      subtleSystemNode: NODE.kundalini,
      tags: ['rising', 'raise'],
      filename: STREAM_CLIP.landscape,
      mimeType: 'video/mp4',
      filesize: 1_570_024,
      width: 1920,
      height: 1080,
      duration: 30,
      fileMetadata: { originalFilename: 'fixture-rising.mp4', duration: 30 },
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    },
  },
  {
    id: FRAME.heartVideo,
    direct: 'Cloudflare Stream clip shared by every environment',
    data: {
      imageSet: 'female',
      label: 'Heart centre, moving',
      subtleSystemNode: NODE.anahat,
      tags: ['anahat', 'hand'],
      filename: STREAM_CLIP.portrait,
      mimeType: 'video/mp4',
      filesize: 1_200_000,
      width: 1080,
      height: 1920,
      duration: 24,
      fileMetadata: { originalFilename: 'fixture-heart.mp4', duration: 24 },
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    },
  },
])
