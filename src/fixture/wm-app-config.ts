import { PAGE } from './content-ids'
import { globalFixture } from './types'

/**
 * The app's configuration, filled so a preview shows the pages it places.
 *
 * Fourteen slots are required and the fixture has seven pages, so a page
 * serves several slots — which slot a page sits in is the app's concern, not
 * this global's. The reminder slot takes the draft retreat page, the one
 * placement a notice reports as held back by publishing rather than by
 * placement.
 */
export default globalFixture('wm-app-config', {
  availableLocales: ['en'],
  classesPage: PAGE.landing,
  liveMeditationsPage: PAGE.landing,
  explorePage: PAGE.welcome,
  exploreDeeperPage: PAGE.welcome,
  meditateTogetherPage: PAGE.landing,
  techniquesPage: PAGE.technique,
  lecturesPage: PAGE.welcome,
  lessonsPage: PAGE.welcome,
  musicPage: PAGE.layouts,
  shriMatajiPage: PAGE.welcome,
  sahajaYogaPage: PAGE.welcome,
  subtleSystemPage: PAGE.subtleOverview,
  privacyPage: PAGE.layouts,
  termsPage: PAGE.layouts,
  liveMeditationsReminderPage: PAGE.retreat,
  pageTags: ['subtle-system'],
})
