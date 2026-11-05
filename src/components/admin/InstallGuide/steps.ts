import type { InstallValues } from './templates'

import { isValidWixPrefix } from '@/lib/atlas/wixPrefix'
import type { SeoCheckId } from '@/lib/clients/verification'
// Deep, never the `@/plugins/usage` barrel: this module reaches the browser.
import { isHostAllowed } from '@/plugins/usage/originEnforcement'

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
export type PlatformId = 'wordpress' | 'wix' | 'custom' | 'iframe'

/** The sub-choice inside a platform, or the platform itself where there is none. */
export type TrackId = 'wp-selfhosted' | 'wp-com' | 'wix' | 'custom' | 'iframe'

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

/** A value with a Copy button beside it. */
export interface Snippet {
  label: string
  value: string
  /** Shown as code when set. `text` is a single value, like a key or a tag name. */
  kind: 'javascript' | 'html' | 'text'
}

/** One instruction, with the value or file it needs right beside it. */
export type Action =
  | string
  | {
      text: string
      snippet?: Snippet
      download?: { label: string; url: string }
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
}

/** A banner's two lines: what it is about, then what to do. */
export interface Notice {
  title: string
  text: string
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
}

export interface Track {
  id: TrackId
  platform: PlatformId
  label: string
  /** Shown under the sub-choice: how a volunteer recognises their own site. */
  recognise: string
  /**
   * A plan the track relies on, stated above the steps as information. A
   * condition rather than a step: nothing done in this tab changes a site's
   * plan, so there is nothing to tick off — and most sites already have it, so
   * it is not worded as a warning.
   */
  requires?: Notice & { offerIframe?: boolean }
  /** Step 3: the atlas working on the site. */
  steps: Step[]
  /** Step 4, where the track has one. */
  more?: FollowOn
  checks: CheckRouting
  /**
   * What the volunteer should know before choosing this track.
   *
   * ⚠ **Shown, not hidden in a comment.** The Studio menu names come from Wix's
   * own documentation and nobody has walked them. A volunteer who hits a menu
   * that is not there needs to know that was expected rather than assume they
   * broke it.
   */
  caveat?: Notice & { tone: 'info' | 'warning' }
}

/** Every step a track renders, in both of its sections. */
export function allSteps(track: Track): Step[] {
  return [...track.steps, ...(track.more?.steps ?? [])]
}

/** The sentence of an action, whatever it carries. */
export function actionText(action: Action): string {
  return typeof action === 'string' ? action : action.text
}

/** Every value a step puts in front of the volunteer to copy. */
export function snippetsOf(step: Step): Snippet[] {
  return step.actions.flatMap((action) =>
    typeof action !== 'string' && action.snippet ? [action.snippet] : [],
  )
}

/** In the order they are offered. */
export const PLATFORM_LABELS: Record<PlatformId, string> = {
  custom: 'Custom site',
  wordpress: 'WordPress',
  wix: 'Wix',
  iframe: 'Iframe only',
}

export const PLATFORM_RECOGNISE: Record<PlatformId, string> = {
  wordpress: 'Your admin address ends in /wp-admin, and the dashboard says “WordPress”.',
  wix: 'You edit the site in the Wix Editor or Wix Studio.',
  custom: 'A developer built the site, and can add a line of code to every page.',
  iframe: 'You can only paste an embed box, and cannot add code to the page itself.',
}

/**
 * Said once a platform is chosen.
 *
 * ⚠ **Wix's two newest editors cannot run this install, and new Wix sites
 * start in one of them.** Harmony has no custom code at all and Studio Two has
 * neither routers nor custom elements (dev.wix.com, "Compare Studio Two";
 * support.wix.com, "About Wix Harmony") — and Wix's own Create New Site flow
 * makes a Harmony site, which cannot be moved to another editor. Both are told
 * apart by what is missing: neither has Dev Mode in the top bar or `{ }` in the
 * left bar. Checked on a real account, 2026-11-05.
 */
export const PLATFORM_NOTICES: Partial<Record<PlatformId, Notice & { offerIframe: boolean }>> = {
  wix: {
    title: 'No Dev Mode or { } in your editor?',
    text: 'Then your site uses Wix Harmony or Studio Two, which cannot run the map’s code.',
    offerIframe: true,
  },
}

/** Which tracks sit under each platform, in the order they are offered. */
export const TRACKS_BY_PLATFORM: Record<PlatformId, TrackId[]> = {
  wordpress: ['wp-selfhosted', 'wp-com'],
  wix: ['wix'],
  custom: ['custom'],
  iframe: ['iframe'],
}

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
      actions: [
        'Turn on coding. In the Wix Editor, click Dev Mode in the top bar, then Turn on Dev Mode. In Wix Studio, click { } in the left bar, then Start Coding Manually.',
        'In the Page Code panel, click + next to Main Pages, choose Add router, and click Continue.',
        {
          text: 'Enter this as the URL prefix, and click Add & Edit Code:',
          snippet: { label: 'URL prefix', value: values.prefix, kind: 'text' },
        },
        `If Wix says a page already uses that prefix, change that page’s URL slug (its ⋯ menu → SEO Basics), then try again.`,
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
        `On the ${page} page, click Add Elements (+), then Embed Code → Custom element. In Wix Studio it is under Embed & Social.`,
        {
          text: 'Click Choose Source. Server URL is already selected — replace the address in its box with this one:',
          snippet: { label: 'Server URL', value: element.serverUrl, kind: 'text' },
        },
        {
          text: 'Replace the Tag name below it with:',
          snippet: { label: 'Tag name', value: element.tagName, kind: 'text' },
        },
        'Make the element the full width of the page and about as tall as the screen: in the Wix Editor with the ↔ button above it, in Wix Studio with W and H on the right. A box with no height shows nothing.',
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
      'Every class already has its own address and title. This last step puts each page’s text where search engines read it.',
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
 * so they share a helper, as the two Wix tracks do.
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
        'Click Create the Atlas page. The plugin makes the page, sizes the map, and handles search engines itself.',
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
    'Optional. The page from step 3 is all most sites need. To also show the atlas inside another page — a classes section on your home page, say — use the shortcode or the block. One atlas per page.',
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
        'In its settings on the right: Open at takes an address from sahajatlas.com, Show the map switches between the map and a list, and Shape sets its proportions, such as 16:9.',
        'In Beaver Builder, add the Sahaj Atlas module instead. It has the same three settings.',
      ],
    },
  ],
}

/**
 * Each track's own label.
 *
 * Kept beside the tracks rather than read off them, so the sub-tab row renders
 * without reaching into a built track — each track's `label` is this map's
 * entry, which `tests/unit/install-steps.spec.ts` pins.
 */
export const TRACK_LABELS: Record<TrackId, string> = {
  'wp-selfhosted': 'Self-hosted',
  'wp-com': 'WordPress.com',
  wix: 'Wix',
  custom: 'Custom site',
  iframe: 'Iframe only',
}

/** Every track, prefilled from one service's own key and chosen address. */
export function tracksFor(values: InstallValues): Record<TrackId, Track> {
  const snippetWithRouting = widgetSnippet(values, { routing: true })
  const snippetPlain = widgetSnippet(values, { routing: false })
  const cms = values.cmsUrl.replace(/\/+$/, '')
  const auth = `Authorization: clients API-Key ${values.apiKey}`

  return {
    'wp-selfhosted': {
      id: 'wp-selfhosted',
      platform: 'wordpress',
      label: TRACK_LABELS['wp-selfhosted'],
      recognise: 'You can reach Plugins → Add New Plugin in your WordPress admin.',
      checks: WORDPRESS_CHECKS,
      steps: wordpressSteps(values, { dotCom: false }),
      more: WORDPRESS_MORE,
    },

    'wp-com': {
      id: 'wp-com',
      platform: 'wordpress',
      label: TRACK_LABELS['wp-com'],
      recognise:
        'Your site is hosted at wordpress.com, and you did not install WordPress yourself.',
      requires: {
        title: 'Requires WordPress Business plan',
        text: 'WordPress.com allows plugins on the Business plan and higher.',
        offerIframe: true,
      },
      checks: WORDPRESS_CHECKS,
      steps: wordpressSteps(values, { dotCom: true }),
      more: WORDPRESS_MORE,
    },

    wix: {
      id: 'wix',
      platform: 'wix',
      label: TRACK_LABELS['wix'],
      recognise: PLATFORM_RECOGNISE.wix,
      checks: WIX_CHECKS,
      steps: wixSteps(values),
      more: wixMore(values),
    },

    custom: {
      id: 'custom',
      platform: 'custom',
      label: TRACK_LABELS['custom'],
      recognise: PLATFORM_RECOGNISE.custom,
      checks: {
        noReport: 'snippet',
        head: 'render-seo',
        body: 'render-seo',
        sitemap: 'render-seo',
      },
      steps: [
        {
          id: 'snippet',
          title: 'Add the widget to the page',
          actions: [
            {
              text: `Choose how tall the map should be, then paste this into the page at ${values.atlasUrl}, where the map should appear:`,
              choice: 'embed-height',
              snippet: { label: 'Embed snippet', value: snippetPlain, kind: 'html' },
            },
            values.embedHeight === 'window'
              ? 'With no height, the map covers the whole browser window, your header included.'
              : 'Keep the style as it is: without a height the map covers the whole window instead of drawing in its own box.',
          ],
        },
      ],
      more: {
        title: SEO_TITLE,
        intro:
          'Your map works. Now give every class its own address and render each page’s title and text on your server, so search engines can list them.',
        steps: [
          {
            id: 'catch-all',
            title: 'Give every class its own address',
            unobservable: true,
            actions: [
              `Make your server answer every address under ${values.atlasUrl} with the same page — ${values.atlasUrl}/ca/ontario included.`,
              {
                text: 'Then replace the snippet from step 3 with this one, which writes each class’s own address into the address bar:',
                snippet: {
                  label: 'Embed snippet, with addresses',
                  value: snippetWithRouting,
                  kind: 'html',
                },
              },
            ],
          },
          {
            id: 'render-seo',
            title: 'Render each page’s metadata on your server',
            actions: [
              {
                text: 'For each address under the atlas page, ask the CMS for that page’s metadata and render it into the page’s <head> and body before sending it:',
                snippet: {
                  label: 'Page metadata',
                  value: `GET ${cms}/api/atlas/seo?route=/ca/ontario\n${auth}`,
                  kind: 'text',
                },
              },
              {
                text: 'List every page this answers in your site’s own sitemap:',
                snippet: {
                  label: 'Sitemap',
                  value: `GET ${cms}/api/atlas/sitemap\n${auth}`,
                  kind: 'text',
                },
              },
              'The guide at docs/embedding.md in the Sahaj Atlas repository has the full contract.',
            ],
          },
        ],
      },
    },

    iframe: {
      id: 'iframe',
      platform: 'iframe',
      label: TRACK_LABELS['iframe'],
      recognise: PLATFORM_RECOGNISE.iframe,
      caveat: {
        tone: 'warning',
        title: 'No search listings',
        text: 'An iframe cannot give your page class titles, addresses or a sitemap. Use it only when nothing else works.',
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
    },
  }
}

/** Which of the four signals a failing SEO check belongs to. */
export function signalFor(check: SeoCheckId): keyof CheckRouting {
  if (check === 'sitemap') return 'sitemap'
  if (check === 'body') return 'body'
  return 'head'
}

/** The step a failing check tells the volunteer to redo. */
export function stepForCheck(track: Track, check: SeoCheckId): StepId {
  return track.checks[signalFor(check)]
}

/** What the volunteer can do about a hint, offered as a button in its banner. */
export type HintAction = 'switch-to-iframe' | 'switch-to-wp-com'

/** Something a site's address already tells us, before anything is installed. */
export interface HostHint extends Notice {
  tone: 'warning' | 'info'
  action?: HintAction
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
 * `allowedDomains` is the service's own list, already parsed. An empty list
 * declares nothing, and `claim-canonical` refuses it exactly as it refuses a
 * host the list does not name.
 */
export function hostHints(args: {
  address: AtlasAddress
  platform: PlatformId
  trackId: TrackId | null
  allowedDomains: string[]
}): HostHint[] {
  const { address, platform, trackId, allowedDomains } = args
  const host = address.host?.toLowerCase()
  if (!host) return []
  const hints: HostHint[] = []
  const under = (domain: string) => host === domain || host.endsWith(`.${domain}`)

  if (!allowedDomains.some((pattern) => isHostAllowed(host, [pattern]))) {
    hints.push({
      tone: 'warning',
      title: `${host} is not on this service yet`,
      text: 'Ask a maintainer to add it to the service’s allowed domains, or the CMS cannot confirm the install.',
    })
  }

  if (!address.secure) {
    hints.push({
      tone: 'warning',
      title: 'Use the https address',
      text: 'Search engines are sent to the https version of each class page. Paste the address with https if your site has it.',
    })
  }

  if (platform === 'wix' && under('wixsite.com')) {
    hints.push({
      tone: 'warning',
      title: 'This is a free Wix address',
      text: 'The map needs Wix Premium and your own domain. Until the site has both, use Iframe only.',
      action: 'switch-to-iframe',
    })
  }

  if (platform === 'wordpress' && under('wordpress.com') && trackId !== 'wp-com') {
    hints.push({
      tone: 'info',
      title: 'This is a WordPress.com site',
      text: 'Its steps differ slightly from a self-hosted WordPress.',
      action: 'switch-to-wp-com',
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
  /** The site's host, or `null` while there is a problem. */
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
 * are still matched on the path alone (`reportedMountsFor`).
 *
 * ⚠ **The query survives only on the home page**, where it *is* the page: a
 * WordPress plain permalink is `/?p=42`. Anywhere else it is tracking noise
 * copied with the address.
 *
 * ⚠ **A Wix address is held to the router's rules** — one lowercase segment —
 * though step 3's ordinary page could live anywhere. Step 4 moves that page's
 * address to a router, and an address the router cannot take would strand it.
 *
 * ⚠ **On Wix the router prefix *is* this path, and must stay the claimed
 * mount's.** The route endpoint decides whether a page is self-canonical by
 * comparing hosts, trusting that the router sits at the mount the client
 * designated — so the tab prefills the address from `canonical.embed` rather
 * than offering a free choice.
 */
export function readAtlasAddress(input: string, options: { wix: boolean }): AtlasAddress {
  const trimmed = input.trim()
  const fail = (problem: string): AtlasAddress => ({
    path: null,
    host: null,
    secure: false,
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
    return fail('That is not a web address. Copy it from your browser’s address bar.')
  }

  const host = url.hostname
  const segments = url.pathname.split('/').filter(Boolean)
  const query = segments.length === 0 && url.search.length > 1 ? url.search : ''

  if (segments.length === 0 && query === '') {
    return fail(
      'That is the site’s home page. The atlas needs a page of its own, such as /classes.',
    )
  }

  if (options.wix) {
    if (segments.length !== 1) {
      return fail(
        'On Wix, use a page one level down, like /classes — a Wix router cannot sit below another page.',
      )
    }
    if (!isValidWixPrefix(segments[0])) {
      return fail('On Wix, use lowercase letters, numbers and hyphens only, like /free-classes.')
    }
  }

  return {
    path: `/${segments.join('/')}${query}`,
    host,
    secure: url.protocol === 'https:',
    problem: null,
  }
}
