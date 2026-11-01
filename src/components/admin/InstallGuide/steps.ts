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
 * per line, the exact menu name, every value prefilled, and a step the
 * volunteer can be *told to redo* when a check fails. A step with no id nothing
 * can point at is a step a failing check cannot name.
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
  | 'prereqs'
  | 'plan'
  | 'install-plugin'
  | 'paste-key'
  | 'create-page'
  | 'dev-mode'
  | 'free-slug'
  | 'add-router'
  | 'paste-routers'
  | 'add-element'
  | 'size-element'
  | 'add-text'
  | 'paste-page-code'
  | 'publish'
  | 'add-to-menu'
  | 'snippet'
  | 'catch-all'
  | 'check-endpoint'

/** A block of text with a Copy button beside it. */
export interface Snippet {
  label: string
  value: string
  /** Shown as code when set. `text` is a single value, like a key or a tag name. */
  kind: 'javascript' | 'html' | 'text'
}

export interface Step {
  id: StepId
  title: string
  /** One instruction per entry, in the order they are done. */
  actions: string[]
  snippets?: Snippet[]
  /**
   * Nothing we can fetch tells us whether this step was done.
   *
   * ⚠ **Marked rather than hidden.** Dev Mode, the element's size and the menu
   * link are real steps; they just cannot carry a check, and a step showing a
   * permanent grey light reads as broken. Saying so is what lets the tab show
   * every other step's result honestly.
   */
  unobservable?: boolean
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
  /** Shown under the platform choice: how a volunteer recognises their own site. */
  recognise: string
  steps: Step[]
  checks: CheckRouting
  /**
   * What is unverified about this track, in the volunteer's own words.
   *
   * ⚠ **Shown, not hidden in a comment.** The Studio menu names come from Wix's
   * own documentation and nobody has walked them; WordPress.com's plugin upload
   * and `robots.txt` line are unconfirmed. A volunteer who hits a menu that is
   * not there needs to know that was expected rather than assume they broke it.
   */
  caveat?: string
}

/** Where the four platform choices send a volunteer who picked wrong. */
export const PLATFORM_LABELS: Record<PlatformId, string> = {
  wordpress: 'WordPress',
  wix: 'Wix',
  custom: 'Custom site',
  iframe: 'Iframe only',
}

export const PLATFORM_RECOGNISE: Record<PlatformId, string> = {
  wordpress: 'Your admin address ends in /wp-admin, and the dashboard says “WordPress”.',
  wix: 'You edit the site by dragging things on the page, and the top bar says “Wix”.',
  custom: 'A developer built the site, and you can add a line of code to every page.',
  iframe: 'You can only paste an embed box, and cannot add code to the page itself.',
}

/** Which tracks sit under each platform, in the order they are offered. */
export const TRACKS_BY_PLATFORM: Record<PlatformId, TrackId[]> = {
  wordpress: ['wp-selfhosted', 'wp-com'],
  wix: ['wix-editor', 'wix-studio'],
  custom: ['custom'],
  iframe: ['iframe'],
}

/** The Wix steps both Wix tracks share, with the menu names switched. */
function wixSteps(values: InstallValues, studio: boolean): Step[] {
  const element = wixCustomElementSettings(values)
  const devMode = studio ? 'Code → Start coding' : 'Dev Mode → Turn on Dev Mode'
  const addRouter = studio
    ? 'Code panel → Backend → Routers → Add Router'
    : 'Dev Mode sidebar → Backend → Routers → Add Router'

  return [
    {
      id: 'prereqs',
      title: 'Check the site is ready',
      unobservable: true,
      actions: [
        'The site must be on a paid Wix Premium plan. A free site cannot do this.',
        'The site must use your own domain name, not an address ending in wixsite.com.',
        'Wix ads must be switched off, which the Premium plan does.',
        'If any of these is not true, use the “Iframe only” track instead — it works on a free site, but the class pages will not appear in search results.',
      ],
    },
    {
      id: 'dev-mode',
      title: 'Turn on coding',
      unobservable: true,
      actions: [`In the top bar, open ${devMode}.`, 'Wix reloads the editor. This is normal.'],
    },
    {
      id: 'free-slug',
      title: `Make sure nothing else uses /${values.prefix}`,
      unobservable: true,
      actions: [
        `Open Pages and check that no existing page is called “${values.prefix}”.`,
        'If one is, rename it, or choose a different atlas address above.',
      ],
    },
    {
      id: 'add-router',
      title: 'Add the router',
      unobservable: true,
      actions: [
        `Open ${addRouter}.`,
        `Enter ${values.prefix} as the router prefix.`,
        `Name the page it creates ${values.prefix} as well. The code below looks for that name.`,
      ],
    },
    {
      id: 'paste-routers',
      title: 'Paste the router code',
      actions: [
        'Open Backend → routers.js in the code panel.',
        'Delete everything already in the file, and paste this in its place.',
        'If the file already has other routers in it, paste this at the end instead.',
      ],
      snippets: [
        { label: 'backend/routers.js', value: wixRoutersTemplate(values), kind: 'javascript' },
      ],
    },
    {
      id: 'add-element',
      title: 'Add the map',
      actions: [
        `On the ${values.prefix} page, click Add → Embed & Social → Custom Element.`,
        'Click Choose Source, pick “Server URL”, and paste the address below.',
        'Paste the tag name below into the “Tag Name” box.',
      ],
      snippets: [
        { label: 'Server URL', value: element.serverUrl, kind: 'text' },
        { label: 'Tag Name', value: element.tagName, kind: 'text' },
      ],
    },
    {
      id: 'size-element',
      title: 'Give the map a size',
      unobservable: true,
      actions: [
        'Drag the custom element to the full width of the page.',
        'Drag its bottom edge down until it is about as tall as the screen.',
        'The map draws inside this box, so a box with no height shows nothing.',
      ],
    },
    {
      id: 'add-text',
      title: 'Add the text search engines read',
      actions: [
        'Click Add → Text → Paragraph, and drop it below the map.',
        `With it selected, open the Properties panel and set its ID to ${CONTENT_ELEMENT_ID}.`,
        'Add it last in its section, so it sits after the map.',
        'Leave its own text empty. The code below fills it in.',
      ],
      snippets: [{ label: 'Element ID', value: CONTENT_ELEMENT_ID, kind: 'text' }],
    },
    {
      id: 'paste-page-code',
      title: 'Paste the page code',
      actions: [
        `Click on the ${values.prefix} page, and open its own code panel at the bottom.`,
        'Paste this in.',
      ],
      snippets: [{ label: 'Page code', value: wixPageCodeTemplate(), kind: 'javascript' }],
    },
    {
      id: 'publish',
      title: 'Publish the site',
      actions: [
        'Click Publish in the top right.',
        'Nothing above this point is live until you do.',
      ],
    },
    {
      id: 'add-to-menu',
      title: 'Add it to the site menu',
      unobservable: true,
      actions: [
        `Open Menus & Pages, and add a link to /${values.prefix}.`,
        'Call it whatever your visitors would look for — “Free classes”, say.',
      ],
    },
  ]
}

/**
 * Both WordPress tracks' checks.
 *
 * Identical on purpose: the plugin owns the whole `<head>`, the body and the
 * sitemap, so every failure points at the one step that installed it.
 */
const WORDPRESS_CHECKS: CheckRouting = {
  noReport: 'create-page',
  head: 'paste-key',
  body: 'create-page',
  sitemap: 'create-page',
}

/**
 * The WordPress steps, which differ between the two tracks by one menu path and
 * one sentence — so they share a helper, as the two Wix tracks do.
 */
function wordpressSteps(values: InstallValues, options: { dotCom: boolean }): Step[] {
  const { dotCom } = options
  const uploadPath = dotCom ? 'Plugins → Upload Plugin' : 'Plugins → Add New → Upload Plugin'

  return [
    ...(dotCom
      ? [
          {
            id: 'plan' as const,
            title: 'Check the plan can install plugins',
            unobservable: true,
            actions: [
              'Open Upgrades → Plans. You need the Business plan or higher.',
              'On a lower plan, WordPress.com allows no plugins at all — use the “Iframe only” track instead. The class pages will not appear in search results.',
            ],
          },
        ]
      : []),
    {
      id: 'install-plugin',
      title: 'Install the plugin',
      actions: [
        'Download the latest sahaj-atlas.zip from the plugin’s releases page.',
        `Open ${uploadPath}, choose the file, and click Install Now.`,
        'Click Activate.',
      ],
    },
    {
      id: 'paste-key',
      title: 'Paste the key',
      actions: [
        'Open Settings → Sahaj Atlas.',
        'Paste the key below into the API key box, and click Save.',
      ],
      snippets: [{ label: 'API key', value: values.apiKey, kind: 'text' }],
    },
    {
      id: 'create-page',
      title: 'Create the atlas page',
      actions: [
        'On the same screen, click Create Atlas page.',
        ...(dotCom
          ? []
          : [
              'That is the whole installation. The plugin makes the page, sizes the map, and handles search engines itself.',
            ]),
      ],
    },
  ]
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

  return {
    'wp-selfhosted': {
      id: 'wp-selfhosted',
      platform: 'wordpress',
      label: TRACK_LABELS['wp-selfhosted'],
      recognise: 'You can reach Plugins → Add New in your WordPress admin.',
      checks: WORDPRESS_CHECKS,
      steps: wordpressSteps(values, { dotCom: false }),
    },

    'wp-com': {
      id: 'wp-com',
      platform: 'wordpress',
      label: TRACK_LABELS['wp-com'],
      recognise:
        'Your site is hosted at wordpress.com, and you did not install WordPress yourself.',
      caveat:
        'Nobody has installed the plugin on a WordPress.com site yet. The plugin upload, the sitemap line in robots.txt, and automatic updates are all expected to work and none is confirmed. Tell a maintainer what you find.',
      checks: WORDPRESS_CHECKS,
      steps: wordpressSteps(values, { dotCom: true }),
    },

    'wix-editor': {
      id: 'wix-editor',
      platform: 'wix',
      label: TRACK_LABELS['wix-editor'],
      recognise: 'The top bar says “Wix”, and there is a Dev Mode menu.',
      checks: {
        noReport: 'add-element',
        head: 'paste-routers',
        body: 'add-text',
        sitemap: 'publish',
      },
      steps: wixSteps(values, false),
    },

    'wix-studio': {
      id: 'wix-studio',
      platform: 'wix',
      label: TRACK_LABELS['wix-studio'],
      recognise: 'The top bar says “Wix Studio”.',
      caveat:
        'The Studio menu names below come from Wix’s own documentation and nobody has walked them on a real site. If a menu is not where this says, it is this guide that is wrong — tell a maintainer, and look for the same words elsewhere in the panel.',
      checks: {
        noReport: 'add-element',
        head: 'paste-routers',
        body: 'add-text',
        sitemap: 'publish',
      },
      steps: wixSteps(values, true),
    },

    custom: {
      id: 'custom',
      platform: 'custom',
      label: TRACK_LABELS['custom'],
      recognise: 'A developer built the site, and can add a line of code to every page.',
      checks: {
        noReport: 'snippet',
        head: 'check-endpoint',
        body: 'check-endpoint',
        sitemap: 'check-endpoint',
      },
      steps: [
        {
          id: 'snippet',
          title: 'Add the widget to the page',
          actions: [
            `Paste this where the map should appear, on the page at ${values.atlasUrl}.`,
            'The height is deliberate: an unsized element covers the whole page instead of drawing in its own box.',
          ],
          snippets: [{ label: 'Embed snippet', value: snippetWithRouting, kind: 'html' }],
        },
        {
          id: 'catch-all',
          title: 'Serve every address under that page',
          unobservable: true,
          actions: [
            `Your server must answer every address under ${values.atlasUrl} with the same page — ${values.atlasUrl}/ca/ontario included.`,
            'Without that, every link into a specific city is a 404 and no search engine will index them.',
            `If you cannot do that, remove routing=path from the snippet. The links then look like ${values.atlasUrl}?atlas=/ca/ontario, which works and is uglier.`,
          ],
        },
        {
          id: 'check-endpoint',
          title: 'Render the page metadata on your server',
          actions: [
            'For each page, read the metadata below and render it into the page’s <head> and body before sending it.',
            'The guide at docs/embedding.md in the Sahaj Atlas repository has the full contract.',
          ],
          snippets: [
            {
              label: 'Try it',
              value: `curl -H 'Authorization: clients API-Key ${values.apiKey}' \\\n  '${values.cmsUrl.replace(/\/+$/, '')}/api/atlas/seo?route=/'`,
              kind: 'text',
            },
          ],
        },
      ],
    },

    iframe: {
      id: 'iframe',
      platform: 'iframe',
      label: TRACK_LABELS['iframe'],
      recognise: 'You can paste an embed box, and nothing else.',
      caveat:
        'This track has no linkable class pages and no search-engine listings. Nothing inside an iframe can give the page around it a title, a canonical link or a sitemap entry. Use it when no other track is possible, and come back to one of them when it is.',
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
            'Paste this into it, and publish.',
          ],
          snippets: [{ label: 'Embed snippet', value: snippetPlain, kind: 'html' }],
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
export interface HostHint {
  message: string
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
        message:
          'This is a free Wix address. The router this track needs requires a paid Wix Premium plan and your own domain name. Until the site has both, use the “Iframe only” track.',
        offerIframe: true,
      },
    ]
  }

  if (platform === 'wordpress' && (lower.endsWith('.wordpress.com') || lower === 'wordpress.com')) {
    return [
      {
        message:
          'This is a WordPress.com address. Installing a plugin there needs the Business plan or higher — check Upgrades → Plans before you start.',
        offerIframe: false,
      },
    ]
  }

  return []
}

/** What is wrong with the atlas address the volunteer typed, or nothing. */
export function atlasUrlProblem(atlasUrl: string): string | null {
  const trimmed = atlasUrl.trim()
  if (trimmed === '') return 'Enter the address the atlas should live at, such as /classes.'
  if (!trimmed.startsWith('/')) return 'The address has to start with a slash, like /classes.'

  const segments = trimmed.slice(1).split('/').filter(Boolean)
  if (segments.length === 0) {
    return 'The atlas needs its own address, not the site’s home page. Try /classes.'
  }
  if (segments.length > 1) {
    return 'Use one level only, like /classes — a Wix router cannot live below another page.'
  }
  if (!isValidWixPrefix(segments[0])) {
    return 'Use lowercase letters, numbers and hyphens only, like /free-classes.'
  }
  return null
}
