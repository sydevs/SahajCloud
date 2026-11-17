import { ID } from './ids'
import { fixture } from './types'

export default fixture('narrators', [
  { id: ID.narrators.female, data: { name: 'Fixture Narrator Amani', gender: 'female' } },
  { id: ID.narrators.male, data: { name: 'Fixture Narrator Tobias', gender: 'male' } },
  { id: ID.narrators.other, data: { name: 'Fixture Narrator Linnea', gender: 'female' } },
])
