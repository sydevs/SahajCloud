import { ID } from './ids'
import { fixture } from './types'

export default fixture('images', [
  {
    id: ID.images.landscape,
    file: 'fixture-landscape.jpg',
    data: {
      alt: 'A wide gradient of blue sky over green hills',
      credit: 'Fixture Studio',
      tags: ['landscape', 'stock-photo', 'meditation'],
    },
  },
  {
    id: ID.images.portrait,
    file: 'fixture-portrait.jpg',
    data: {
      alt: 'A tall gradient of magenta and amber',
      credit: 'Fixture Studio',
      tags: ['portrait', 'author', 'technique'],
    },
  },
  {
    id: ID.images.square,
    file: 'fixture-square.png',
    data: {
      alt: 'A square gradient of green and yellow',
      tags: ['square', 'thumbnail', 'lesson'],
    },
  },
  // A service logo, an SVG, which skips orientation tagging.
  {
    id: ID.images.logo,
    file: 'fixture-logo.svg',
    data: {
      alt: 'A white lotus on a blue disc',
      tags: ['icon', 'placeholder', 'app-card'],
    },
  },
  // No credit and a single tag.
  {
    id: 1_004_010,
    file: 'fixture-wide.webp',
    data: {
      alt: 'A wide purple and pink gradient',
      tags: ['landscape'],
    },
  },
  // Untagged: only the orientation tag the upload adds.
  {
    id: 1_004_011,
    file: 'fixture-thumbnail.png',
    data: {
      alt: 'A small orange gradient',
    },
  },
])
