import { ID } from './ids'
import { fixture } from './types'

export default fixture('audiences', [
  {
    id: ID.audiences.first,
    data: {
      label: 'Fixture audience: new to the path',
      pathProgress: { min: 0, max: 5 },
      totalMeditationsViewed: { max: 10 },
    },
  },
  {
    id: ID.audiences.second,
    data: {
      label: 'Fixture audience: regular practitioners',
      pathProgress: { min: 6 },
      meditationsPerWeek: { min: 3, max: 7 },
      totalMeditationsViewed: { min: 50 },
      totalLecturesViewed: { min: 5, max: 40 },
    },
  },
  // A country gate and nothing else.
  {
    id: ID.audiences.third,
    data: {
      label: 'Fixture audience: Nordic listeners',
      location: { countries: ['SE', 'NO', 'DK', 'FI'] },
    },
  },
])
