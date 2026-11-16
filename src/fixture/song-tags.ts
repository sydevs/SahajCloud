import { ID } from './ids'
import { fixture } from './types'

export default fixture('song-tags', [
  {
    id: ID.songTags.first,
    file: 'fixture-tag-1.svg',
    data: { title: 'Fixture Calm' },
    locales: { fr: { title: 'Fixture Calme' } },
  },
  {
    id: ID.songTags.second,
    file: 'fixture-tag-2.svg',
    data: { title: 'Fixture Devotional' },
  },
  {
    id: ID.songTags.third,
    file: 'fixture-tag-3.svg',
    data: { title: 'Fixture Instrumental' },
  },
])
