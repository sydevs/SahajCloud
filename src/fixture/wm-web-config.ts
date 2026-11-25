import { PAGE } from './content-ids'
import { ID } from './ids'
import { globalFixture } from './types'

/**
 * The website's configuration, filled so a preview shows the pages it places.
 *
 * `pageTags` is what makes placement visible past the pages named here: it
 * takes `fixture-hands-on-the-earth` and the twelve node pages, none of which
 * this configuration names, so the sidebar table has a tagged page to report
 * as well as a named one. `fixture-creativity-and-stillness` is tagged
 * `creativity` and named nowhere, which leaves it the negative case.
 */
export default globalFixture('wm-web-config', {
  availableLocales: ['en'],
  homePage: PAGE.landing,
  audiences: [ID.audiences.first],
  featuredPages: [PAGE.landing, PAGE.welcome],
  featuredArticles: [PAGE.welcome, PAGE.subtleOverview],
  classPages: [PAGE.layouts],
  knowledgePages: [PAGE.subtleOverview],
  infoPages: [PAGE.layouts],
  pageTags: ['wisdom'],
})
