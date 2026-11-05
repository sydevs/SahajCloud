import type { InstallValues } from './templates'

import { isValidWixPrefix } from '@/lib/atlas/wixPrefix'
import type { SeoCheckId } from '@/lib/clients/verification'

import {
  CONTENT_ELEMENT_ID,
  widgetSnippet,
  wixCustomElementSettings,
  wixPageCodeTemplate,
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
export type TrackId = 'wp-selfhosted' | 'wp-com' | 'wix-editor' | 'wix-studio' | 'custom' | 'iframe'

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
  | 'move-map'
  | 'add-text'
  | 'publish-seo'
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
   * What the site must already have, shown above the steps with a way out to the
   * iframe track. A condition rather than a step: nothing done in this tab
   * changes a site's plan, so there is nothing to tick off.
   */
  requires?: Notice
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

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  wordpress: 'WordPress',
  wix: 'Wix',
  custom: 'Custom site',
  iframe: 'Iframe only',
}

export const PLATFORM_RECOGNISE: Record<PlatformId, string> = {
  wordpress: 'Your admin address ends in /wp-admin, and the dashboard says “WordPress”.',
  wix: 'You edit the site by dragging things on the page, and the top bar says “Wix”.',
  custom: 'A developer built the site, and can add a line of code to every page.',
  iframe: 'You can only paste an embed box, and cannot add code to the page itself.',
}

/** Which tracks sit under each platform, in the order they are offered. */
export const TRACKS_BY_PLATFORM: Record<PlatformId, TrackId[]> = {
  wordpress: ['wp-selfhosted', 'wp-com'],
  wix: ['wix-editor', 'wix-studio'],
  custom: ['custom'],
  iframe: ['iframe'],
}

/** Step 4's title wherever it is search listings. */
const SEO_TITLE = 'Let search engines list your classes'

/** Getting the map onto an ordinary Wix page — no code, no router. */
function wixEmbedSteps(values: InstallValues, studio: boolean): Step[] {
  const element = wixCustomElementSettings(values)
  return [
    {
      id: 'add-page',
      title: 'Add the atlas page',
      unobservable: true,
      actions: [
        `Open ${studio ? 'Pages' : 'Pages & Menu'}, click + Add Page, and choose a blank page.`,
        'Name it what visitors would look for, such as “Free classes”. That name shows in your site menu.',
        {
          text: 'In the page’s ⋯ menu, open SEO Basics and set its URL slug to:',
          snippet: { label: 'URL slug', value: values.prefix, kind: 'text' },
        },
      ],
    },
    {
      id: 'add-element',
      title: 'Add the map, and publish',
      actions: [
        'On that page, click Add → Embed & Social → Custom Element.',
        {
          text: 'Click Choose Source, pick “Server URL”, and paste:',
          snippet: { label: 'Server URL', value: element.serverUrl, kind: 'text' },
        },
        {
          text: 'In the “Tag Name” box, paste:',
          snippet: { label: 'Tag Name', value: element.tagName, kind: 'text' },
        },
        'Stretch the element to the full width of the page and about as tall as the screen. The map draws inside this box, so a box with no height shows nothing.',
        'Click Publish.',
      ],
    },
  ]
}

/**
 * Turning the working page into a router page, which is what gives every class
 * its own indexable address.
 *
 * ⚠ **The router needs the page's own slug.** Wix refuses a router prefix an
 * ordinary page already uses, so the step-3 page is renamed out of the way, its
 * map carried across, and the page deleted. None of it is live until the last
 * Publish, so visitors keep the working map throughout.
 */
function wixSeoSteps(values: InstallValues, studio: boolean): FollowOn {
  const devMode = studio ? 'Code → Start coding' : 'Dev Mode → Turn on Dev Mode'
  const addRouter = studio
    ? 'Code panel → Backend → Routers → Add Router'
    : 'Dev Mode sidebar → Backend → Routers → Add Router'

  return {
    title: SEO_TITLE,
    intro:
      'Your map works. These steps give every class and city its own page in search results. Visitors see no change until you publish at the end.',
    steps: [
      {
        id: 'add-router',
        title: 'Add the router',
        unobservable: true,
        actions: [
          `In the atlas page’s ⋯ menu → SEO Basics, change its URL slug to ${values.prefix}-old. The router needs /${values.prefix} for itself.`,
          `In the top bar, open ${devMode}. Wix reloads the editor, which is normal.`,
          {
            text: `Open ${addRouter}, and enter this as the router prefix:`,
            snippet: { label: 'Router prefix', value: values.prefix, kind: 'text' },
          },
          `Name the page it creates ${values.prefix} as well. The code in the next step looks for that name.`,
        ],
      },
      {
        id: 'paste-routers',
        title: 'Paste the router code',
        actions: [
          'Open Backend → routers.js in the code panel.',
          {
            text: 'Delete everything already in the file, and paste this in its place. If the file already has other routers in it, paste this at the end instead.',
            snippet: {
              label: 'backend/routers.js',
              value: wixRoutersTemplate(values),
              kind: 'javascript',
            },
          },
        ],
      },
      {
        id: 'move-map',
        title: 'Move the map onto the router page',
        unobservable: true,
        actions: [
          `Open the ${values.prefix}-old page, select the map, and copy it (Ctrl+C, or ⌘C on a Mac).`,
          `Open the ${values.prefix} router page and paste it (Ctrl+V, or ⌘V). Stretch it to full width and screen height again if it shrank.`,
          `Delete the ${values.prefix}-old page from its ⋯ menu.`,
        ],
      },
      {
        id: 'add-text',
        title: 'Add the text search engines read',
        actions: [
          'On the router page, click Add → Text → Paragraph, and drop it below the map. Leave its own text empty.',
          {
            text: 'With it selected, open the Properties panel and set its ID to:',
            snippet: { label: 'Element ID', value: CONTENT_ELEMENT_ID, kind: 'text' },
          },
          {
            text: `Open the ${values.prefix} page’s own code panel at the bottom of the screen, and paste this. It fills the paragraph for you.`,
            snippet: { label: 'Page code', value: wixPageCodeTemplate(), kind: 'javascript' },
          },
        ],
      },
      {
        id: 'publish-seo',
        title: 'Publish again',
        actions: ['Click Publish. Wix lists every class page in your sitemap when you do.'],
      },
    ],
  }
}

const WIX_CHECKS: CheckRouting = {
  noReport: 'add-element',
  head: 'paste-routers',
  body: 'add-text',
  sitemap: 'publish-seo',
}

const WIX_REQUIRES: Notice = {
  title: 'Needs Wix Premium and your own domain',
  text: 'A free site, or an address ending in wixsite.com, cannot run the map. Use Iframe only until it has both.',
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
  'wix-editor': 'Wix Editor',
  'wix-studio': 'Wix Studio',
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
        title: 'Needs the Business plan',
        text: 'WordPress.com allows plugins only on Business or higher (Upgrades → Plans). On a lower plan, use Iframe only.',
      },
      checks: WORDPRESS_CHECKS,
      steps: wordpressSteps(values, { dotCom: true }),
      more: WORDPRESS_MORE,
    },

    'wix-editor': {
      id: 'wix-editor',
      platform: 'wix',
      label: TRACK_LABELS['wix-editor'],
      recognise: 'The top bar says “Wix”, and there is a Dev Mode menu.',
      requires: WIX_REQUIRES,
      checks: WIX_CHECKS,
      steps: wixEmbedSteps(values, false),
      more: wixSeoSteps(values, false),
    },

    'wix-studio': {
      id: 'wix-studio',
      platform: 'wix',
      label: TRACK_LABELS['wix-studio'],
      recognise: 'The top bar says “Wix Studio”.',
      requires: WIX_REQUIRES,
      caveat: {
        tone: 'info',
        title: 'Menu names not yet confirmed',
        text: 'Nobody has walked these Studio steps on a real site. If a menu is not where it says, look for the same words nearby, and tell a maintainer.',
      },
      checks: WIX_CHECKS,
      steps: wixEmbedSteps(values, true),
      more: wixSeoSteps(values, true),
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
              text: `Paste this into the page at ${values.atlasUrl}, where the map should appear:`,
              snippet: { label: 'Embed snippet', value: snippetPlain, kind: 'html' },
            },
            'Keep the height: an element with no height covers the whole page instead of drawing in its own box.',
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

/** A warning a volunteer needs before they start, read off their site address. */
export interface HostHint extends Notice {
  /** True when the only honest advice is the iframe track. */
  offerIframe: boolean
}

/**
 * What a site's own address already tells us, before anything is installed.
 *
 * Two addresses answer a question the volunteer would otherwise only discover
 * after an hour of work, and both are checked as they type rather than at a
 * Verify step nobody reaches. There is deliberately no server-side detection of
 * anything else: a guess about somebody's hosting that turns out wrong is worse
 * than asking.
 */
export function hostHints(args: { host: string | null; platform: PlatformId }): HostHint[] {
  const { host, platform } = args
  if (!host) return []
  const lower = host.toLowerCase()

  if (platform === 'wix' && (lower.endsWith('.wixsite.com') || lower === 'wixsite.com')) {
    return [
      {
        title: 'This is a free Wix address',
        text: 'The map needs a paid Wix Premium plan and your own domain name. Until the site has both, use Iframe only.',
        offerIframe: true,
      },
    ]
  }

  if (platform === 'wordpress' && (lower.endsWith('.wordpress.com') || lower === 'wordpress.com')) {
    return [
      {
        title: 'This is a WordPress.com address',
        text: 'Installing a plugin there needs the Business plan or higher. Check Upgrades → Plans before you start.',
        offerIframe: false,
      },
    ]
  }

  return []
}

/** The atlas address as the tab uses it, read off whatever the volunteer pasted. */
export interface AtlasAddress {
  /**
   * The page's path, or `null` while there is a problem. This is what reports
   * are matched on and what the steps name, so a whole URL and a bare path for
   * the same page give the same answer.
   */
  path: string | null
  /** The site's host, when the volunteer pasted more than a path. */
  host: string | null
  problem: string | null
}

/**
 * Read the atlas address out of a URL, a host and path, or a bare path.
 *
 * A volunteer copies the address bar, so a whole URL is the normal input and a
 * path the exception. Only the path is used — reports are matched on it
 * (`reportedMountsFor`) — but the host is kept for `hostHints`, which can then
 * warn about a free Wix site before anything has reported.
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
  const fail = (problem: string): AtlasAddress => ({ path: null, host: null, problem })
  if (trimmed === '') return fail('Paste the address of the page that will show the atlas.')

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const bare = trimmed.replace(/^\/+/, '')
  const looksLikeHost = !hasScheme && !trimmed.startsWith('/') && /^[^/?#]+\.[^/?#]+/.test(bare)
  const url = URL.parse(
    hasScheme ? trimmed : looksLikeHost ? `https://${bare}` : `https://site.invalid/${bare}`,
  )
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    return fail('That is not a web address. Copy it from your browser’s address bar.')
  }

  const host = hasScheme || looksLikeHost ? url.hostname : null
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

  return { path: `/${segments.join('/')}${query}`, host, problem: null }
}
