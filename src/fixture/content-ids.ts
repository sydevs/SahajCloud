/** Ids the content collections' files share; a leaf, so none of those files can form an import cycle. */

/** The 12 subtle-system pages, in the order `subtle-system-nodes.ts` lists its nodes. */
export const NODE_PAGES = [
  { slug: 'mooladhara', id: 1_014_101, title: 'Mooladhara, the root of balance' },
  { slug: 'swadhistan', id: 1_014_102, title: 'Swadhistan, the seat of creativity' },
  { slug: 'nabhi', id: 1_014_103, title: 'Nabhi, the centre of satisfaction' },
  { slug: 'void', id: 1_014_104, title: 'The Void, the guide within' },
  { slug: 'anahat', id: 1_014_105, title: 'Anahat, the heart centre' },
  { slug: 'vishuddhi', id: 1_014_106, title: 'Vishuddhi, the centre of expression' },
  { slug: 'agnya', id: 1_014_107, title: 'Agnya, the gate of forgiveness' },
  { slug: 'sahasrara', id: 1_014_108, title: 'Sahasrara, the crown' },
  { slug: 'kundalini', id: 1_014_109, title: 'Kundalini, the resting energy' },
  { slug: 'pingala', id: 1_014_110, title: 'The right channel' },
  { slug: 'ida', id: 1_014_111, title: 'The left channel' },
  { slug: 'sushumna', id: 1_014_112, title: 'The central channel' },
] as const

export const NODE = Object.fromEntries(
  NODE_PAGES.map((node, i) => [node.slug, 1_011_001 + i]),
) as Record<(typeof NODE_PAGES)[number]['slug'], number>

export const PAGE = {
  welcome: 1_014_001,
  landing: 1_014_002,
  creative: 1_014_003,
  technique: 1_014_004,
  retreat: 1_014_005,
  layouts: 1_014_006,
  subtleOverview: 1_014_007,
  // A three-level chain, so a reviewer can see a composed address and a
  // breadcrumb trail without building one (#1250).
  nestedSection: 1_014_008,
  nestedChild: 1_014_009,
  nestedGrandchild: 1_014_010,
} as const

export const FRAME = {
  mooladhara: 1_012_001,
  swadhistan: 1_012_002,
  nabhi: 1_012_003,
  void: 1_012_004,
  anahat: 1_012_005,
  vishuddhi: 1_012_006,
  agnya: 1_012_007,
  sahasrara: 1_012_008,
  kundalini: 1_012_009,
  ida: 1_012_010,
  pingala: 1_012_011,
  sushumna: 1_012_012,
  bandhan: 1_012_013,
  namaste: 1_012_014,
  risingVideo: 1_012_015,
  heartVideo: 1_012_016,
} as const

export const MEDITATION = {
  pathEnglish: 1_015_011,
  justUploaded: 1_015_012,
  dailyEnglish: 1_015_013,
  dailySpanish: 1_015_010,
} as const

export const CHOICE = {
  feelings: 1_010_001,
  calm: 1_010_002,
  energised: 1_010_003,
  sleep: 1_010_004,
  deepen: 1_010_005,
  stress: 1_010_006,
  five: 1_010_007,
  ten: 1_010_008,
  twenty: 1_010_009,
} as const

export const LECTURE = {
  introduction: 1_019_001,
  energy: 1_019_002,
  forgiveness: 1_019_003,
  introductionClip: 1_019_004,
  energyClip: 1_019_005,
} as const

export const ALBUM = {
  stillness: 1_017_001,
  evening: 1_017_002,
  morning: 1_017_003,
} as const
