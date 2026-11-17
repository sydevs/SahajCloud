import { ID } from './ids'
import { fixture } from './types'

export default fixture('authors', [
  {
    id: ID.authors.first,
    data: {
      name: 'Fixture Author Mireille Dufort',
      title: 'Painter and workshop leader',
      description: 'Has meditated daily since her first class and writes about stillness.',
      countryCode: 'FR',
      yearsMeditating: 12,
      photo: ID.images.portrait,
    },
  },
  {
    id: ID.authors.second,
    data: {
      name: 'Fixture Author Kofi Mensah',
      title: 'Teacher, writer and cook',
      description: 'Teaches weekly classes and collects recipes from the people he meets.',
      countryCode: 'GH',
      yearsMeditating: 5,
      photo: ID.images.square,
    },
  },
  // Only a name: every optional field empty.
  {
    id: ID.authors.third,
    data: { name: 'Fixture Author Ilse Brandt' },
  },
])
