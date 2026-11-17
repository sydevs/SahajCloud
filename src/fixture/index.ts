import type { CollectionFixture } from './types'

import albums from './albums'
import appCards from './app-cards'
import audiences from './audiences'
import authors from './authors'
import clients from './clients'
import events from './events'
import files from './files'
import forms from './forms'
import frames from './frames'
import images from './images'
import imports from './imports'
import lectures from './lectures'
import lessons from './lessons'
import managers from './managers'
import meditations from './meditations'
import narrators from './narrators'
import pages from './pages'
import payloadJobs from './payload-jobs'
import regions from './regions'
import songTags from './song-tags'
import songs from './songs'
import subtleSystemNodes from './subtle-system-nodes'
import transcripts from './transcripts'
import userChoices from './user-choices'
import userSubmissions from './user-submissions'
import users from './users'
import videos from './videos'

/** Every collection's fixture, one file each. The loader orders them by their relationships. */
export const FIXTURES = [
  managers,
  regions,
  users,
  images,
  files,
  narrators,
  authors,
  audiences,
  songTags,
  userChoices,
  subtleSystemNodes,
  frames,
  videos,
  pages,
  meditations,
  transcripts,
  albums,
  songs,
  lectures,
  lessons,
  appCards,
  clients,
  forms,
  imports,
  events,
  userSubmissions,
  payloadJobs,
] as CollectionFixture[]
