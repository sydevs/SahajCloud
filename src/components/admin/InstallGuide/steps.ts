import type { InstallValues } from './templates'

import type { Snippet } from '@/components/admin/CopyBlock'
import { isValidWixPrefix } from '@/lib/atlas/wixPrefix'
// Deep, never the `@/plugins/usage` barrel: this module reaches the browser.
import type { SiteTrack } from '@/lib/clients/site'
import { siteHosts } from '@/lib/clients/site'
import type { SeoCheckId } from '@/lib/clients/verification'

import {
  CONTENT_ELEMENT_ID,
  widgetSnippet,
  wixCustomElementSettings,
  wixPageCodeTemplate,
  wixRouterPageName,
  wixRoutersTemplate,
} from './templates'

/**
 * What a volunteer is asked to do, per platform, as data (#1055).
 *
 * **Written for one non-technical volunteer per site, across 13 national
 * organisations.** That is not a tone note, it is the whole shape: one action
 * per line, the exact menu name, every value prefilled beside the line that
 * uses it, and a step the volunteer can be *told to redo* when a check fails. A
 * step with no id nothing can point at is a step a failing check cannot name.
 *
 * **A working map first, search listings second.** Step 3 of the tab ends with
 * the atlas live on the site; step 4 is what comes after (`Track.more`). A
 * volunteer who stops halfway has a working page, not a half-built router.
 *
 * **No step asks the volunteer to check anything by hand.** The CMS checks, and
 * step 3 ends with the button that asks it to.
 *
 * Kept out of the component so it is readable as a list and
 * `tests/unit/install-steps.spec.ts` can check the couplings — a track whose
 * check routing names a step it does not have is a red light with nowhere to go.
 */

/** Which family of site this is. The volunteer's first and only real choice. */
export type PlatformId = 'wordpress' | 'wix' | 'squarespace' | 'custom' | 'iframe'

/**
 * The sub-choice inside a platform, or the platform itself where there is none:
 * `site.track`'s vocabulary, which the record stores so the tab reopens on it.
 */
export type TrackId = SiteTrack

/**
 * Every step any track can have.
 *
 * One union rather than free strings, so a check can only be routed to a step
 * that exists. `tests/unit/install-steps.spec.ts` is what makes that a failure
 * rather than a silent mis-route.
 */
export type StepId =
  | 'install-plugin'
  | 'set-up'
  | 'shortcode'
  | 'block'
  | 'add-page'
  | 'add-element'
  | 'add-router'
  | 'paste-routers'
  | 'add-text'
  | 'snippet'
  | 'catch-all'
  | 'render-seo'

/**
 * The plugin's release zip, at an address that never changes.
 *
 * ⚠ **Resolves only while every release attaches an unversioned
 * `sahaj-atlas.zip`** beside its versioned one — `releases/latest/download/`
 * names an asset, not a pattern. That asset is sydevs/SahajAtlasWordpress's
 * `release.yml` to attach (sydevs/SahajAtlasWordpress#76); drop it there and
 * this link 404s for every volunteer.
 */
export const WORDPRESS_PLUGIN_ZIP_URL =
  'https://github.com/sydevs/SahajAtlasWordpress/releases/latest/download/sahaj-atlas.zip'

/** Where the plugin puts the page it creates, before anyone renames it. */
export const WORDPRESS_DEFAULT_PATH = '/find-a-class'

/** One instruction, with the value or file it needs right beside it. */
export type Action =
  | string
  | {
      text: string
      snippet?: Snippet
      download?: { label: string; url: string }
      /** Alternatives, shown as bullets under the sentence — one per editor, say. */
      items?: string[]
      /** A choice the volunteer makes here, which changes the snippet below it. */
      choice?: 'embed-height'
    }

export interface Step {
  id: StepId
  title: string
  /** In the order they are done. */
  actions: Action[]
  /**
   * Nothing we can fetch tells us whether this step was done.
   *
   * ⚠ **Marked rather than hidden.** Renaming a page or moving the map are real
   * steps; they just cannot carry a check, and a step showing a permanent grey
   * light reads as broken. Saying so is what lets the tab show every other
   * step's result honestly.
   */
  unobservable?: boolean
  /** A notice at the top of the step, for a site the step cannot work on. */
  notice?: Notice
}

/** A banner's two lines: what it is about, then what to do. */
export interface Notice {
  title: string
  text: string
  tone?: 'warning'
  /** A button that switches the tab to a track that works where this one cannot. */
  action?: { label: string; to: TrackId }
}

/** Step 4 of the tab: what comes once the atlas works. */
export interface FollowOn {
  title: string
  intro: string
  /** Nothing in it is checked, so its steps carry no status at all. */
  optional?: boolean
  steps: Step[]
}

/**
 * Which step each failing signal tells the volunteer to redo.
 *
 * A failing check that names no step is a red light with no action behind it,
 * which is worse than no light — so every track declares all four.
 */
export interface CheckRouting {
  /** The widget has never reported itself on the chosen page. */
  noReport: StepId
  /** A report arrived, but the `<head>` is not ours: `title`, `canonical`, `json-ld`. */
  head: StepId
  /** The crawlable text is missing. */
  body: StepId
  /** No sitemap on the site lists the page. */
  sitemap: StepId
  /**
   * The step that gives each class an address of its own, for a track whose
   * own steps set that up. Confirmed when the widget reports `routing=path`
   * and the routing probe finds the server answering under the page.
   */
  routing?: StepId
}

/** What the tab knows of a track before building its steps. */
export interface TrackMeta {
  platform: PlatformId
  label: string
  /** Shown under the sub-choice: how a volunteer recognises their own site. */
  recognise: string
  /**
   * `false` where no class can have a search listing of its own — an iframe, or
   * a site whose own canonical tag sends every class address back to the page.
   *
   * The CMS skips its search checks on such a site (`hasSearchListings`, which
   * must agree), and the tab ignores any stored from an earlier track: the
   * Search listings row reads Not available.
   */
  searchListings?: false
  /**
   * `false` where the widget cannot put a class's address in the page's URL at
   * all — an iframe. Every other embed has class addresses, as `?atlas=` links
   * at the least, whether or not the site can also serve `/classes/ca/ontario`.
   */
  classAddresses?: false
}

export interface Track extends TrackMeta {
  id: TrackId
  /**
   * A plan the track relies on, stated above the steps as information. A
   * condition rather than a step: nothing done in this tab changes a site's
   * plan, so there is nothing to tick off — and most sites already have it, so
   * it is not worded as a warning.
   */
  requires?: Notice
  /** Step 3: the atlas working on the site. */
  steps: Step[]
  /** Step 4, where the track has one. */
  more?: FollowOn
  checks: CheckRouting
  /**
   * What the volunteer should know before choosing this track, shown as a warning.
   *
   * ⚠ **Shown, not hidden in a comment.** The Studio menu names come from Wix's
   * own documentation and nobody has walked them. A volunteer who hits a menu
   * that is not there needs to know that was expected rather than assume they
   * broke it.
   */
  caveat?: Notice
}

/** In the order they are offered. */
export const PLATFORM_LABELS: Record<PlatformId, string> = {
  custom: 'Custom site',
  wordpress: 'WordPress',
  wix: 'Wix',
  squarespace: 'Squarespace',
  iframe: 'Iframe only',
}

export const PLATFORM_RECOGNISE: Record<PlatformId, string> = {
  wordpress: 'Your admin address ends in /wp-admin, and the dashboard says “WordPress”.',
  wix: 'You edit the site in the Wix Editor or Wix Studio.',
  custom: 'A developer built your site and can add code to it.',
  squarespace: 'You edit the site at squarespace.com.',
  iframe: 'You can paste an embed box on a page, but not add code to the page itself.',
}

/** Every track, in the order it is offered under its platform. */
export const TRACK_META: Record<TrackId, TrackMeta> = {
  'wp-selfhosted': {
    platform: 'wordpress',
    label: 'Self-hosted',
    recognise: 'You can reach Plugins → Add New Plugin in your WordPress admin.',
  },
  'wp-com': {
    platform: 'wordpress',
    label: 'WordPress.com',
    recognise: 'Your site is hosted by WordPress.com.',
  },
  wix: { platform: 'wix', label: 'Wix', recognise: PLATFORM_RECOGNISE.wix },
  squarespace: {
    platform: 'squarespace',
    label: 'Squarespace',
    recognise: PLATFORM_RECOGNISE.squarespace,
    searchListings: false,
  },
  custom: { platform: 'custom', label: 'Custom site', recognise: PLATFORM_RECOGNISE.custom },
  iframe: {
    platform: 'iframe',
    label: 'Iframe only',
    recognise: PLATFORM_RECOGNISE.iframe,
    searchListings: false,
    classAddresses: false,
  },
}

/** Which tracks sit under each platform, in the order they are offered. */
export const TRACKS_BY_PLATFORM = Object.fromEntries(
  (Object.keys(PLATFORM_LABELS) as PlatformId[]).map((platform) => [
    platform,
    (Object.keys(TRACK_META) as TrackId[]).filter((id) => TRACK_META[id].platform === platform),
  ]),
) as Record<PlatformId, TrackId[]>

/** Step 4's title wherever it is search listings. */
const SEO_TITLE = 'Let search engines list your classes'

/**
 * The router and the map on it, from the start, in the Wix Editor and Wix Studio
 * alike.
 *
 * ⚠ **The router comes first because a page cannot become one.** Wix gives a
 * router a page of its own, so a map first placed on an ordinary page has to be
 * carried across before any class has an address. Coding and routers are free on
 * every Wix plan; the Custom Element is what needs Premium.
 *
 * ⚠ **One track for both editors, walked on a real account (2026-11-05).** Once
 * coding is on they share every panel this install touches — Page Code → Main
 * Pages → + → Add router, the routers.js tab, `<prefix>-page`, Choose Source with
 * Server URL preselected, the ID box — and differ in three places, each said in
 * the one line it applies to: turning coding on, the Custom Element's menu, and
 * how an element is stretched.
 */
function wixSteps(values: InstallValues): Step[] {
  const element = wixCustomElementSettings(values)
  const page = wixRouterPageName(values.prefix)
  return [
    {
      id: 'add-router',
      title: 'Turn on coding, and add the router',
      unobservable: true,
      notice: WIX_NO_CODING,
      actions: [
        {
          text: 'Turn on coding:',
          items: [
            'In the Wix Editor, click Dev Mode in the top bar, then Turn on Dev Mode.',
            'In Wix Studio, click **{ }** in the left bar, then Start Coding Manually.',
          ],
        },
        'In the Page Code panel, click + next to Main Pages, choose Add router, and click Continue.',
        {
          text: 'Enter this as the URL prefix, and click Add & Edit Code:',
          snippet: { label: 'URL prefix', value: values.prefix, kind: 'text' },
        },
        `If Wix says a page already uses that prefix, change that page’s address (its ⋯ menu → SEO Basics → URL slug), then try again.`,
        `Wix creates a page called ${page}. Leave its name as it is — the code in the next step looks for it.`,
      ],
    },
    {
      id: 'paste-routers',
      title: 'Paste the router code',
      actions: [
        {
          text: 'Click the routers.js tab in the code panel at the bottom, select everything in it, and paste this in its place:',
          snippet: {
            label: 'backend/routers.js',
            value: wixRoutersTemplate(values),
            kind: 'javascript',
          },
        },
      ],
    },
    {
      id: 'add-element',
      title: 'Add the map, and publish',
      actions: [
        {
          text: `On the ${page} page, add a Custom element:`,
          items: [
            'In the Wix Editor, click Add Elements (+), then Embed Code → Custom element.',
            'In Wix Studio, click Add Elements (+), then Embed & Social → Custom Element.',
          ],
        },
        {
          text: 'Click Choose Source. Server URL is already selected — replace the address in its box with this one:',
          snippet: { label: 'Server URL', value: element.serverUrl, kind: 'text' },
        },
        {
          text: 'Replace the Tag name below it with:',
          snippet: { label: 'Tag name', value: element.tagName, kind: 'text' },
        },
        {
          text: 'Make the map the full width of the page and about as tall as the screen. A box with no height shows nothing.',
          items: [
            'In the Wix Editor, click the ↔ button above it, then drag its bottom edge down.',
            'In Wix Studio, set its width (W) and height (H) in the panel on the right.',
          ],
        },
        'Click Publish. The map shows only on your published site, not in the editor.',
      ],
    },
  ]
}

/**
 * The one thing the router does not already give search engines: each page's
 * text, in an element the page code fills.
 */
function wixMore(values: InstallValues): FollowOn {
  const page = wixRouterPageName(values.prefix)
  return {
    title: 'Let search engines read your classes',
    intro:
      'Every class already has its own address and title in search results. This last step adds each class’s description, so search engines can read that too.',
    steps: [
      {
        id: 'add-text',
        title: 'Add the text search engines read',
        actions: [
          `On the ${page} page, click Add Elements (+) → Text, and add a paragraph below the map. Its words do not matter — the code replaces them.`,
          {
            text: 'With the paragraph selected, set the ID box at the right of the code panel to:',
            snippet: { label: 'Element ID', value: CONTENT_ELEMENT_ID, kind: 'text' },
          },
          {
            text: `Click the ${page} tab in the code panel, select everything in it, and paste this in its place:`,
            snippet: { label: 'Page code', value: wixPageCodeTemplate(), kind: 'javascript' },
          },
          'Click Publish.',
        ],
      },
    ],
  }
}

/**
 * Shown in the Wix step that asks for Dev Mode, where a site without it finds out.
 *
 * ⚠ **Wix's two newest editors cannot run this install, and new Wix sites
 * start in one of them.** Harmony has no custom code at all and Studio Two has
 * neither routers nor custom elements (dev.wix.com, "Compare Studio Two";
 * support.wix.com, "About Wix Harmony") — and Wix's own Create New Site flow
 * makes a Harmony site, which cannot be moved to another editor. Both are told
 * apart by what is missing: neither has Dev Mode in the top bar or `{ }` in the
 * left bar. Checked on a real account, 2026-11-05.
 */
const WIX_NO_CODING: Notice = {
  title: 'No Dev Mode or { } in your editor?',
  text: 'Then your site was made with Wix Harmony or Studio Two, which cannot run the map’s code yet.',
  action: { label: 'Switch to Iframe only', to: 'iframe' },
}

/** The Wix track's checks. The sitemap is the router code's own `_SiteMap`, so a missing entry points there. */
const WIX_CHECKS: CheckRouting = {
  noReport: 'add-element',
  head: 'paste-routers',
  body: 'add-text',
  sitemap: 'paste-routers',
}

/**
 * Both WordPress tracks' checks.
 *
 * All one step on purpose: the plugin owns the whole `<head>`, the body and the
 * sitemap, and every one of them follows from the key and the page it creates.
 */
const WORDPRESS_CHECKS: CheckRouting = {
  noReport: 'set-up',
  head: 'set-up',
  body: 'set-up',
  sitemap: 'set-up',
}

/**
 * The WordPress steps, which differ between the two tracks by one menu path —
 * so they share a helper.
 *
 * The page the plugin creates is always at {@link WORDPRESS_DEFAULT_PATH}, so a
 * site that wants the atlas anywhere else is told how to move it there — where
 * the address is, not before, because the page does not exist until this step.
 */
function wordpressSteps(values: InstallValues, options: { dotCom: boolean }): Step[] {
  const uploadPath = options.dotCom
    ? 'Plugins → Upload Plugin'
    : 'Plugins → Add New Plugin → Upload Plugin'
  const slug = values.atlasUrl.split('?')[0].split('/').filter(Boolean).pop()
  const rename =
    slug && values.atlasUrl !== WORDPRESS_DEFAULT_PATH
      ? [
          {
            text: `The page starts at ${WORDPRESS_DEFAULT_PATH}. To move it to ${values.atlasUrl}, open Pages, hover over “Find a meditation class”, click Quick Edit, set its Slug to the value below, and click Update.`,
            snippet: { label: 'Slug', value: slug, kind: 'text' as const },
          },
        ]
      : []

  return [
    {
      id: 'install-plugin',
      title: 'Install the plugin',
      actions: [
        {
          text: 'Download the plugin:',
          download: { label: 'Download sahaj-atlas.zip', url: WORDPRESS_PLUGIN_ZIP_URL },
        },
        `In WordPress, open ${uploadPath}, choose the file, and click Install Now.`,
        'Click Activate. The plugin keeps itself up to date from then on.',
      ],
    },
    {
      id: 'set-up',
      title: 'Connect it, and create the page',
      actions: [
        'Open Settings → Sahaj Atlas.',
        {
          text: 'Paste this key into the API key box, and click Save Changes:',
          snippet: { label: 'API key', value: values.apiKey, kind: 'text' },
        },
        'Click Create the Atlas page. The plugin makes the page, sizes the map, and takes care of search engines for you.',
        ...rename,
        'Add the page to your site’s menu (Appearance → Menus).',
      ],
    },
  ]
}

/** The shortcode and the block, for an atlas inside some other page. */
const WORDPRESS_MORE: FollowOn = {
  title: 'Show the atlas inside other pages',
  intro:
    'Optional — the page from step 3 is all most sites need. To also show the atlas inside another page, such as a classes section on your home page, use a shortcode or the Sahaj Atlas block. Each page can show one atlas.',
  optional: true,
  steps: [
    {
      id: 'shortcode',
      title: 'With the shortcode',
      actions: [
        {
          text: 'Type it into any page or post, or into a page builder’s Shortcode widget:',
          snippet: { label: 'The map', value: '[sahaj_atlas]', kind: 'text' },
        },
        {
          text: 'To open it at a country or city, find the place on sahajatlas.com and paste its address between the quotes:',
          snippet: {
            label: 'Opened at a country',
            value: '[sahaj_atlas atlas="https://sahajatlas.com/gb"]',
            kind: 'text',
          },
        },
        {
          text: 'To show a list of classes instead of the map, add map="false":',
          snippet: {
            label: 'One city’s classes, as a list',
            value: '[sahaj_atlas map="false" atlas="https://sahajatlas.com/gb/london"]',
            kind: 'text',
          },
        },
      ],
    },
    {
      id: 'block',
      title: 'With the block',
      actions: [
        'In the block editor, add the Sahaj Atlas block.',
        {
          text: 'Choose its settings on the right:',
          items: [
            'Open at: paste an address from sahajatlas.com to open at a country or city.',
            'Show the map: turn this off to show a list of classes instead.',
            'Shape: the map’s proportions, such as 16:9. Leave it empty for a square.',
          ],
        },
        'In Beaver Builder, add the Sahaj Atlas module instead. It has the same three settings.',
      ],
    },
  ],
}

/**
 * The atlas on one Squarespace page, in a Code Block.
 *
 * ⚠ **Class addresses, as `?atlas=` links, and no search listings.** The widget
 * runs in the page itself, so each class has an address of its own in query
 * form. But Squarespace serves no page for an address it has no page for, so
 * there is no `/classes/ca/ontario` and the snippet carries no `routing=path`;
 * and its own canonical tag drops the query string, so search engines see every
 * class address as the one page. From Squarespace's help pages, 2026-11-05;
 * untested on a real site.
 *
 * ⚠ **Logged in, Squarespace shows no map.** It swaps every script in a Code
 * Block for a "disabled while you're logged in" notice, and its "Preview in safe
 * mode" renders the code in a sandboxed frame the widget may not run in — so the
 * step sends the volunteer to a private window instead.
 */
function squarespaceSteps(values: InstallValues, snippet: string): Step[] {
  const slug = values.prefix
  return [
    {
      id: 'add-page',
      title: 'Add the atlas page',
      unobservable: true,
      actions: [
        'In the Pages panel, click + next to Main Navigation, then + Add Blank → Page. Name it what visitors would look for, such as “Free classes”.',
        {
          text: 'Hover over the new page, click its gear icon, set the URL slug to this, and click Save:',
          snippet: { label: 'URL slug', value: slug, kind: 'text' },
        },
      ],
    },
    {
      id: 'snippet',
      title: 'Add the map, and save',
      notice: {
        title: 'On an older 7.0 template?',
        text: 'If the bottom of your Pages panel shows a template name instead of “Version 7.1”, open Site styles and turn off Enable Ajax loading. Otherwise the map only appears after a page refresh.',
      },
      actions: [
        'Click Edit at the top left. Hover over the page, click Add Block, and search for Code.',
        'Click the Code block’s pencil icon. Set Mode to HTML, and leave Display Source off.',
        {
          text: 'Choose how tall the map should be, then paste this into the block:',
          choice: 'embed-height',
          snippet: { label: 'Embed snippet', value: snippet, kind: 'html' },
        },
        'Drag the block’s edges out to the full width of the section.',
        'Click Exit, then Save.',
        'While you are logged in, Squarespace shows “Embedded scripts are disabled” instead of the map. To see the map, open the page in a private window.',
        'If your site is not public yet, open Settings → Site availability and choose Public. We cannot see a private or password-protected site.',
      ],
    },
  ]
}

/** Every track, prefilled from one service's own key and chosen address. */
export function tracksFor(values: InstallValues): Record<TrackId, Track> {
  const snippetWithRouting = widgetSnippet(values, { routing: true })
  const snippetPlain = widgetSnippet(values, { routing: false })
  const cms = values.cmsUrl.replace(/\/+$/, '')
  const auth = `Authorization: clients API-Key ${values.apiKey}`
  const track = (id: TrackId, rest: Omit<Track, 'id' | keyof TrackMeta>): Track => ({
    id,
    ...TRACK_META[id],
    ...rest,
  })

  return {
    'wp-selfhosted': track('wp-selfhosted', {
      checks: WORDPRESS_CHECKS,
      steps: wordpressSteps(values, { dotCom: false }),
      more: WORDPRESS_MORE,
    }),

    'wp-com': track('wp-com', {
      requires: {
        title: 'Requires WordPress Business plan',
        text: 'WordPress.com allows plugins on the Business plan and higher.',
        action: { label: 'No Business plan? Switch to Iframe only', to: 'iframe' },
      },
      checks: WORDPRESS_CHECKS,
      steps: wordpressSteps(values, { dotCom: true }),
      more: WORDPRESS_MORE,
    }),

    wix: track('wix', {
      checks: WIX_CHECKS,
      steps: wixSteps(values),
      more: wixMore(values),
    }),

    custom: track('custom', {
      checks: {
        noReport: 'snippet',
        head: 'render-seo',
        body: 'render-seo',
        sitemap: 'render-seo',
        routing: 'catch-all',
      },
      steps: [
        {
          id: 'snippet',
          title: 'Add the map to the page',
          actions: [
            {
              text: `Choose how tall the map should be, then paste this into the page at ${values.atlasUrl}, where the map should appear${values.embedHeight === 'window' ? '' : '. Keep its `style` attribute: that is what gives the map its height'}:`,
              choice: 'embed-height',
              snippet: { label: 'Embed snippet', value: snippetPlain, kind: 'html' },
            },
            'Publish the change, then open the page once in your browser. That is how the map tells us where it is.',
          ],
        },
      ],
      more: {
        title: SEO_TITLE,
        intro:
          'Your map works. To get each class into search results, give every class its own address, and have your server add each page’s title and text.',
        steps: [
          {
            id: 'catch-all',
            title: 'Give every class its own address',
            actions: [
              `Today a class opens at an address like ${values.atlasUrl}?atlas=/ca/ontario. This step changes that to ${values.atlasUrl}/ca/ontario: a clean address that search engines can list as a page of its own.`,
              {
                text: `Set up your server so that every address starting with ${values.atlasUrl}/ shows the same page as ${values.atlasUrl}, and keeps the address as it is, with no redirect. Without this, anyone who opens a shared class link gets a “Page not found” error. It is usually one of these:`,
                items: [
                  'A catch-all route for the page, in a framework such as Next.js, Nuxt or Astro.',
                  'A rewrite rule, in Nginx, Apache or your hosting’s settings.',
                  'A rewrite with status 200, on Netlify or Cloudflare Pages.',
                ],
              },
              {
                text: 'Then swap the snippet from step 3 for this one. It shows each class’s own address in the browser’s address bar:',
                snippet: {
                  label: 'Embed snippet, with class addresses',
                  value: snippetWithRouting,
                  kind: 'html',
                },
              },
              'The map starts using the new addresses once Region claimed shows Done. From then on, links already shared in the ?atlas= form open the main atlas page.',
            ],
          },
          {
            id: 'render-seo',
            title: 'Add each page’s title and text on your server',
            actions: [
              {
                text: `Each time your server builds a page under ${values.atlasUrl}, have it ask Sahaj Atlas about that page first. Send the part of the address after ${values.atlasUrl} as \`route\` (\`/\` for the atlas page itself), and the page’s language as \`locale\`, such as \`en\` or \`de\`:`,
                snippet: {
                  label: 'Page details',
                  value: `GET ${cms}/api/atlas/seo?route=/ca/ontario&locale=en\n${auth}`,
                  kind: 'text',
                },
              },
              {
                text: 'Put what comes back into the page before your server sends it:',
                items: [
                  '`title` in the page’s `<title>`.',
                  '`description` in `<meta name="description">`. When it is empty, write a one-line description of your own.',
                  '`canonical` in `<link rel="canonical">`, and each of `alternates` as a `<link rel="alternate">`. When `canonical` is empty, use the page’s own address.',
                  '`openGraph` as `<meta property>` tags, for link previews on social media.',
                  '`jsonLd` inside `<script type="application/ld+json">`, exactly as it arrives.',
                  '`content` as text in the page body, beside the map rather than inside it: class names, times and addresses, so search engines can read what the map shows.',
                ],
              },
              'Keep each answer for up to five minutes, for each address and language, instead of asking again on every visit.',
              {
                text: 'Add every address this lists to your site’s own sitemap, so search engines find each class:',
                snippet: {
                  label: 'Sitemap',
                  value: `GET ${cms}/api/atlas/sitemap\n${auth}`,
                  kind: 'text',
                },
              },
            ],
          },
        ],
      },
    }),

    squarespace: track('squarespace', {
      requires: {
        title: 'Requires Squarespace Core or higher',
        text: 'The map needs a paid Core, Plus or Advanced plan (or an older Business or Commerce plan), on a site set to Public.',
        action: { label: 'On Basic or Personal? Switch to Iframe only', to: 'iframe' },
      },
      checks: {
        noReport: 'snippet',
        head: 'snippet',
        body: 'snippet',
        sitemap: 'snippet',
      },
      steps: squarespaceSteps(values, snippetPlain),
    }),

    iframe: track('iframe', {
      caveat: {
        title: 'No search listings',
        text: 'With an iframe, classes do not get their own links or search results. Use it only when nothing else works.',
      },
      checks: {
        noReport: 'snippet',
        head: 'snippet',
        body: 'snippet',
        sitemap: 'snippet',
      },
      steps: [
        {
          id: 'snippet',
          title: 'Paste the embed',
          actions: [
            'Add an HTML or “embed code” block to the page where the map should appear.',
            {
              text: 'Paste this into it, and publish:',
              snippet: { label: 'Embed snippet', value: snippetPlain, kind: 'html' },
            },
          ],
        },
      ],
    }),
  }
}

/** Which of the three signals a failing SEO check belongs to. */
export function signalFor(check: SeoCheckId): 'head' | 'body' | 'sitemap' {
  if (check === 'sitemap') return 'sitemap'
  if (check === 'body') return 'body'
  return 'head'
}

/** The step a failing check tells the volunteer to redo. */
export function stepForCheck(track: Track, check: SeoCheckId): StepId {
  return track.checks[signalFor(check)]
}

/**
 * What a site's own address already tells us, before anything is installed.
 *
 * Each answers a question the volunteer would otherwise only discover at the
 * end — a claim refused for an undeclared domain, a free Wix site that cannot
 * run the element — and all are read off the address as it is typed. There is
 * deliberately no server-side detection: a guess about somebody's hosting that
 * turns out wrong is worse than asking.
 *
 * `savedDomain` is the domain the service had when the tab opened. A service is
 * one site, and its key works on that site alone, so an address on another
 * domain moves the whole service there — which deserves a warning, not silence.
 */
export function hostHints(args: {
  address: AtlasAddress
  platform: PlatformId
  trackId: TrackId | null
  savedDomain?: string | null
}): Notice[] {
  const { address, platform, trackId, savedDomain } = args
  const host = address.host?.toLowerCase()
  if (!host) return []
  const hints: Notice[] = []
  const under = (domain: string) => host === domain || host.endsWith(`.${domain}`)

  const saved = siteHosts(savedDomain)
  if (saved.length > 0 && !saved.includes(host)) {
    hints.push({
      tone: 'warning',
      title: `This moves the service to ${host}`,
      text: `The map will only load on ${host} from now on. A second site needs a service of its own.`,
    })
  }

  if (!address.secure) {
    hints.push({
      tone: 'warning',
      title: 'Use the address that starts with https',
      text: 'Search engines link to the secure (https) version of your page. Use it if your site has one.',
    })
  }

  if (platform === 'wix' && under('wixsite.com')) {
    hints.push({
      tone: 'warning',
      title: 'This is a free Wix address',
      text: 'The map needs Wix Premium and your own domain name. Until the site has both, use Iframe only.',
      action: { label: 'Switch to Iframe only', to: 'iframe' },
    })
  }

  if (platform === 'wordpress' && under('wordpress.com') && trackId !== 'wp-com') {
    hints.push({
      title: 'This is a WordPress.com site',
      text: 'The steps for WordPress.com are slightly different.',
      action: { label: 'Switch to WordPress.com', to: 'wp-com' },
    })
  }

  return hints
}

/** The atlas address as the tab uses it, read off whatever the volunteer pasted. */
export interface AtlasAddress {
  /**
   * The page's path, or `null` while there is a problem. This is what reports
   * are matched on and what the steps name, so a whole URL and a bare path for
   * the same page give the same answer.
   */
  path: string | null
  /**
   * The site's host, or `null` until the input parses as a web address — kept
   * through a path problem, so a free Wix address is named as one.
   */
  host: string | null
  /** Whether the address is https — the only scheme a canonical URL is built with. */
  secure: boolean
  problem: string | null
}

/**
 * Read the atlas address out of a whole URL, with or without its scheme.
 *
 * ⚠ **The domain is required.** A volunteer copies the address bar, so a whole
 * URL is what they have — and the host is what `hostHints` reads to warn about
 * an undeclared domain or a free Wix site before anything has reported. Reports
 * are matched on the path and that host (`reportedMountsFor`).
 *
 * ⚠ **The query survives only on the home page**, where it *is* the page: a
 * WordPress plain permalink is `/?p=42`. Anywhere else it is tracking noise
 * copied with the address.
 *
 * ⚠ **A Wix or Squarespace address is one lowercase segment** (`oneLevel`). A
 * Wix router prefix is exactly that, and a Squarespace URL slug takes no slash
 * and no capital, so any other address could never be the page the steps build.
 *
 * ⚠ **On Wix the router prefix *is* this path, and must stay the claimed
 * mount's.** The route endpoint decides whether a page is self-canonical by
 * comparing hosts, trusting that the router sits at the mount the client
 * designated — so the tab reopens on the saved address (`site`) rather than
 * an empty field.
 */
export function readAtlasAddress(
  input: string,
  options: {
    /**
     * The platform whose address is one lowercase word after the domain — a Wix
     * router prefix, a Squarespace URL slug — named for the message.
     */
    oneLevel?: string
  } = {},
): AtlasAddress {
  const trimmed = input.trim()
  const fail = (problem: string, url?: URL): AtlasAddress => ({
    path: null,
    host: url?.hostname ?? null,
    secure: url?.protocol === 'https:',
    problem,
  })
  if (trimmed === '') return fail('Paste the address of the page that will show the atlas.')

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const bare = trimmed.replace(/^\/+/, '')
  const looksLikeHost = !hasScheme && !trimmed.startsWith('/') && /^[^/?#]+\.[^/?#]+/.test(bare)
  if (!hasScheme && !looksLikeHost) {
    return fail('Paste the whole address, with your domain — such as https://yoursite.org/classes.')
  }
  const url = URL.parse(hasScheme ? trimmed : `https://${bare}`)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
    return fail('That does not look like a web address. Copy it from your browser’s address bar.')
  }

  const host = url.hostname
  const segments = url.pathname.split('/').filter(Boolean)
  const query = segments.length === 0 && url.search.length > 1 ? url.search : ''

  if (segments.length === 0 && query === '') {
    return fail(
      'That is your site’s home page. The atlas needs a page of its own, such as /classes.',
      url,
    )
  }

  const { oneLevel } = options
  if (oneLevel) {
    if (segments.length !== 1) {
      return fail(
        `On ${oneLevel}, the atlas page must come straight after your domain, like /classes — not inside another page.`,
        url,
      )
    }
    if (!isValidWixPrefix(segments[0])) {
      return fail(
        `On ${oneLevel}, use lowercase letters, numbers and hyphens only, like /free-classes.`,
        url,
      )
    }
  }

  return {
    path: `/${segments.join('/')}${query}`,
    host,
    secure: url.protocol === 'https:',
    problem: null,
  }
}
