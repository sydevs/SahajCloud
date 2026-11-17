import { ALBUM } from './content-ids'
import { ID } from './ids'
import { fixture } from './types'

export default fixture('albums', [
  {
    id: ALBUM.stillness,
    data: {
      artwork: ID.images.square,
      title: 'Fixture Stillness',
      artist: 'Fixture Ensemble',
      artistUrl: 'https://example.invalid/fixture-ensemble',
    },
    locales: {
      de: { title: 'Stille', artist: 'Fixture Ensemble' },
    },
  },
  {
    id: ALBUM.evening,
    data: {
      artwork: ID.images.portrait,
      title: 'Fixture Evening Ragas',
      artist: 'Fixture Duo',
    },
  },
  {
    id: ALBUM.morning,
    data: {
      artwork: ID.images.landscape,
      title: 'Fixture Morning Light',
      artist: 'Fixture Strings',
      artistUrl: 'https://example.invalid/fixture-strings',
    },
  },
])
