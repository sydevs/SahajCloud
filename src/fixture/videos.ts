import { at } from './at'
import { ID } from './ids'
import { STREAM_CLIP } from './stream'
import { fixture, type FixtureEntry } from './types'

const STREAM = 'a Cloudflare Stream clip, which an upload through the app would re-send'

const clip = (
  filename: string,
  orientation: 'landscape' | 'portrait',
): Pick<
  FixtureEntry<'videos'>['data'],
  'filename' | 'mimeType' | 'filesize' | 'width' | 'height'
> =>
  orientation === 'landscape'
    ? { filename, mimeType: 'video/mp4', filesize: 1_048_576, width: 1280, height: 720 }
    : { filename, mimeType: 'video/mp4', filesize: 786_432, width: 720, height: 1280 }

const stamps = { createdAt: at({ days: -20 }), updatedAt: at({ days: -20 }) }

// `title` is localized and `payload.db` takes locale-keyed values, which the typed data cannot say.
const title = (en: string): never => ({ en }) as never

export default fixture('videos', [
  {
    id: ID.videos.first,
    direct: STREAM,
    data: {
      ...stamps,
      ...clip(STREAM_CLIP.landscape, 'landscape'),
      title: title('Fixture video: a first-time visitor shares her story'),
      tags: 'testimonial',
      thumbnail: ID.images.landscape,
      fileMetadata: { originalFilename: 'fixture-testimonial.mp4' },
    },
  },
  {
    id: ID.videos.second,
    direct: STREAM,
    data: {
      ...stamps,
      ...clip(STREAM_CLIP.portrait, 'portrait'),
      title: title('Fixture video: a short breathing workshop'),
      tags: 'workshop',
      thumbnail: ID.images.portrait,
      fileMetadata: { originalFilename: 'fixture-workshop.mp4' },
    },
  },
  {
    id: ID.videos.third,
    direct: STREAM,
    data: {
      ...stamps,
      ...clip(STREAM_CLIP.landscape2, 'landscape'),
      title: title('Fixture video: highlights from a community event'),
      tags: 'event',
      fileMetadata: { originalFilename: 'fixture-event.mp4' },
    },
  },
  {
    id: 1_013_010,
    direct: STREAM,
    data: {
      ...stamps,
      ...clip(STREAM_CLIP.portrait2, 'portrait'),
      title: title('Fixture video: how to sit comfortably'),
      tags: 'technique',
      thumbnail: ID.images.square,
      fileMetadata: { originalFilename: 'fixture-technique.mp4' },
    },
  },
])
