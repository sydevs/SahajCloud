import type { CollectionConfig } from 'payload'

import { slugField, publicUrlFields } from '@/fields'
import { APP_REQUIRED_PAGE_FIELDS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
import { serverEnv } from '@/lib/env'
import { livePreviewUrl } from '@/lib/livePreview/url'
import { PAGE_TAGS } from '@/lib/pageTags'
import { fullRichTextEditor } from '@/lib/richEditor'
import { pageBlocks } from '@/lib/richEditor/blocks'
import { removeDanglingLexicalReferencesAfterRead } from '@/lib/richEditor/lexicalHooks'
import { adminOnlyFieldAccess } from '@/plugins/access'

import { loadAppConfigOnce } from './appConfigCache'
import { buildPageWebPath } from './webPath'

export const Pages: CollectionConfig = {
  slug: 'pages',
  defaultPopulate: { appUrl: false },
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', '_status'],
    livePreview: {
      // The real page, not a preview route: `buildPageWebPath` is the same
      // composer `webPath` publishes, so the panel and the published URL
      // cannot disagree. A page with no slug yet has no address, and lands on
      // the explanation instead of a URL that 404s.
      url: ({ data, locale }) =>
        livePreviewUrl({
          base: serverEnv.WEMEDITATE_WEB_URL,
          path: buildPageWebPath({ slug: data?.slug, locale: locale.code }),
        }),
    },
  },
  versions: {
    maxPerDoc: 3,
    drafts: {
      autosave: {
        interval: 60000, // 60 seconds
      },
      schedulePublish: true,
      // `_status` is stored per locale, so publishing German says nothing about
      // French. `?locale=all&select[_status]=true` then answers "which languages
      // is this page live in?" in one query — the `hreflang` contract
      // WeMeditateWeb reads (#718). Needs `experimental.localizeStatus` at the
      // config root, or Payload sanitises this back to false.
      localizeStatus: true,
    },
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              localized: true,
            },
            {
              name: 'content',
              type: 'richText',
              localized: true,
              editor: fullRichTextEditor(pageBlocks),
              hooks: {
                afterRead: [removeDanglingLexicalReferencesAfterRead],
              },
            },
          ],
        },
      ],
    },
    slugField({ useAsSlug: 'title', collectionSlug: 'pages' }),
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
      admin: {
        position: 'sidebar',
        description: 'Article author (for article pages)',
      },
    },
    {
      name: 'featuredVideo',
      type: 'relationship',
      relationTo: 'videos',
      admin: {
        position: 'sidebar',
        description: 'Featured video displayed on this page',
      },
    },
    {
      name: 'tags',
      type: 'select',
      hasMany: true,
      options: PAGE_TAGS,
      admin: {
        position: 'sidebar',
      },
    },
    {
      // Document-level access: managers listed here can read + update this page
      // even without role-based access (see src/plugins/access/documentManagers.ts).
      // Assigning editors is admin-only; editors edit content, not the editor list.
      name: 'managers',
      type: 'relationship',
      relationTo: 'managers',
      hasMany: true,
      label: 'Page Editors',
      access: {
        update: adminOnlyFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Managers who can edit this page without broader permissions.',
      },
    },
    // Virtual deep links: public web URL + in-app URL (registered app pages
    // only). Both require the page to be published (gate built into
    // publicUrlFields). Web path carries the optional locale, then the slug.
    //
    // ⚠ **No tag segment.** This used to emit `[locale, tag, slug]`, which no
    // site has ever served. WeMeditateWeb routes a page at one segment —
    // `ROUTE_BUILDERS.pages` is `'/' + slug` and `pages/[slug]/+route.ts`
    // matches `^/([^/]+)/?$`, with its own spec pinning that a nested path does
    // not match — and its sitemap publishes the same shape. The legacy Rails
    // site does not serve it either: its articles live at `/articles/<slug>`
    // and `wisdom` appears only as `/inspiration/wisdom`, a category index
    // (checked against production, 2026-09-15). So every tagged page published
    // a `webUrl` that 404s, while untagged ones worked — which is why it went
    // unnoticed. `buildWebPath` below is also what the live-preview URL is
    // built from, so the panel would have landed on those same 404s.
    ...publicUrlFields({
      // Raw `process.env`, deliberately: this callback runs per read, so the
      // late bind is what lets a spec stub the base with `vi.stubEnv`. The
      // guard already degrades to `null` rather than interpolating `undefined`,
      // which is the failure mode `serverEnv` exists to prevent elsewhere.
      web: () => (process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/` : null),
      app: 'wemeditate://',
      buildPath: ({ platform, data, req }) => {
        // The app deep-links by bare slug; the web path is shared with the
        // live-preview panel through `buildPageWebPath`, so the two cannot
        // drift. See that module for why the locale is passed, not read.
        if (platform === 'app') {
          return typeof data?.slug === 'string' && data.slug.length > 0 ? data.slug : null
        }
        return buildPageWebPath({ slug: data?.slug, locale: req.locale })
      },
      // Both links already require published (publicUrlFields' built-in gate).
      // Beyond that, the web link needs no extra condition; the app link is
      // additionally gated to pages registered in the WeMeditate app config.
      exposeWhen: async ({ platform, data, req }) => {
        if (platform === 'web') return true
        const id = data?.id
        if (!id) return false

        // Load wm-app-config once per request (memoized), not once per doc — a
        // bulk publish fans this afterRead across every page concurrently. See
        // loadAppConfigOnce for why the cache holds the promise, not the value.
        const config = await loadAppConfigOnce(req)

        return APP_REQUIRED_PAGE_FIELDS.some((field) => {
          const val = config[field]
          if (val === id) return true
          return typeof val === 'object' && val !== null && (val as { id: unknown }).id === id
        })
      },
    }),
  ],
}
