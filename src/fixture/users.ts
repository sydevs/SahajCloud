import { ID } from './ids'
import { fixture } from './types'

export const USER_IDS = {
  dara: 1_003_004,
  emeka: 1_003_005,
  fiora: 1_003_006,
  gustavo: 1_003_007,
} as const

export default fixture('users', [
  {
    id: ID.users.amara,
    data: { name: 'Amara Lindqvist', email: 'amara.lindqvist@fixture.invalid' },
  },
  {
    id: ID.users.bruno,
    data: { name: 'Bruno Achterberg', email: 'bruno.achterberg@fixture.invalid' },
  },
  { id: ID.users.chen, data: { name: 'Chen Ostrowski', email: 'chen.ostrowski@fixture.invalid' } },
  { id: USER_IDS.dara, data: { name: 'Dara Nwosu', email: 'dara.nwosu@fixture.invalid' } },
  { id: USER_IDS.emeka, data: { name: 'Emeka Varga', email: 'emeka.varga@fixture.invalid' } },
  {
    id: USER_IDS.fiora,
    data: { name: 'Fiora Castellan', email: 'fiora.castellan@fixture.invalid' },
  },
  {
    id: USER_IDS.gustavo,
    data: {
      name: 'Gustavo Pell',
      email: 'gustavo.pell@fixture.invalid',
      blockedAt: '2026-10-01T09:00:00.000Z',
      blockedReason: 'Fixture: a blocked sender, to show the Block state.',
    },
  },
])
