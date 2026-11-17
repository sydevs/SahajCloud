import { ID } from './ids'
import { MANAGER_IDS } from './managers'
import { fixture } from './types'

export const REGION_IDS = {
  region: 1_002_004,
  citySecond: 1_002_005,
  venueSecond: 1_002_006,
  unmanagedCountry: 1_002_010,
  unmanagedRegion: 1_002_011,
  unmanagedCity: 1_002_012,
  unmanagedVenue: 1_002_013,
} as const

const manual = (seed: string) => `manual-fixture-${seed}`

export default fixture('regions', [
  {
    id: ID.regions.country,
    data: {
      level: 'country',
      mapboxId: manual('vasanta'),
      name: 'Fixture Vasanta',
      slug: 'fixture-vasanta',
      generateSlug: false,
      latitude: 51.5,
      longitude: -0.12,
      radius: 400000,
    },
  },
  {
    id: REGION_IDS.region,
    data: {
      level: 'region',
      parent: ID.regions.country,
      managers: [MANAGER_IDS.regionManagerNorth],
      mapboxId: manual('northmarch'),
      name: 'Fixture Northmarch',
      slug: 'fixture-northmarch',
      generateSlug: false,
      latitude: 51.8,
      longitude: -0.2,
      radius: 120000,
    },
  },
  {
    id: ID.regions.city,
    data: {
      level: 'city',
      parent: REGION_IDS.region,
      managers: [ID.managers.regionManager],
      mapboxId: manual('harbourton'),
      name: 'Fixture Harbourton',
      slug: 'fixture-harbourton',
      generateSlug: false,
      subtitle: 'Fixture Vasanta',
      latitude: 51.507,
      longitude: -0.128,
      radius: 20000,
    },
  },
  {
    id: ID.regions.venue,
    data: {
      level: 'venue',
      parent: ID.regions.city,
      mapboxId: manual('lantern-hall'),
      name: 'Fixture Lantern Hall',
      slug: 'fixture-lantern-hall',
      generateSlug: false,
      subtitle: '14 Blossom Lane',
      latitude: 51.5105,
      longitude: -0.1301,
      radius: 200,
    },
  },
  {
    id: REGION_IDS.citySecond,
    data: {
      level: 'city',
      parent: ID.regions.country,
      mapboxId: manual('saltmere'),
      name: 'Fixture Saltmere',
      slug: 'fixture-saltmere',
      generateSlug: false,
      latitude: 51.2,
      longitude: 0.3,
      radius: 15000,
    },
  },
  {
    id: REGION_IDS.venueSecond,
    data: {
      level: 'venue',
      parent: REGION_IDS.citySecond,
      mapboxId: manual('tidewater-library'),
      name: 'Fixture Tidewater Library',
      slug: 'fixture-tidewater-library',
      generateSlug: false,
      subtitle: '3 Quay Street',
      latitude: 51.201,
      longitude: 0.301,
      radius: 150,
    },
  },
  // A whole tree with no manager anywhere up its chain.
  {
    id: REGION_IDS.unmanagedCountry,
    data: {
      level: 'country',
      mapboxId: manual('tamarind'),
      name: 'Fixture Tamarind',
      slug: 'fixture-tamarind',
      generateSlug: false,
      latitude: 48.5,
      longitude: 2.3,
      radius: 350000,
    },
  },
  {
    id: REGION_IDS.unmanagedRegion,
    data: {
      level: 'region',
      parent: REGION_IDS.unmanagedCountry,
      mapboxId: manual('tamarind-coast'),
      name: 'Fixture Tamarind Coast',
      slug: 'fixture-tamarind-coast',
      generateSlug: false,
      latitude: 48.7,
      longitude: 2.1,
      radius: 90000,
    },
  },
  {
    id: REGION_IDS.unmanagedCity,
    data: {
      level: 'city',
      parent: REGION_IDS.unmanagedRegion,
      mapboxId: manual('orchard-bay'),
      name: 'Fixture Orchard Bay',
      slug: 'fixture-orchard-bay',
      generateSlug: false,
      latitude: 48.75,
      longitude: 2.15,
      radius: 12000,
    },
  },
  {
    id: REGION_IDS.unmanagedVenue,
    data: {
      level: 'venue',
      parent: REGION_IDS.unmanagedCity,
      mapboxId: manual('copper-kettle-hall'),
      name: 'Fixture Copper Kettle Hall',
      slug: 'fixture-copper-kettle-hall',
      generateSlug: false,
      subtitle: '9 Orchard Row',
      latitude: 48.751,
      longitude: 2.151,
      radius: 120,
    },
  },
])
