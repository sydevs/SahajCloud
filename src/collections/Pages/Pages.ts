import type { CollectionConfig } from 'payload'

import { slugField, publicUrlFields } from '@/fields'
import { weMeditatePreviewUrl } from '@/lib/env'
import { livePreviewUrl } from '@/lib/livePreview/url'
import { isPagePlaced, loadServicePages } from '@/lib/pageServices'
import { PAGE_TAGS } from '@/lib/pageTags'
import { fullRichTextEditor } from '@/lib/richEditor'
import { pageBlocks } from '@/lib/richEditor/blocks'
import { removeDanglingLexicalReferencesAfterRead } from '@/lib/richEditor/lexicalHooks'
import { adminOnlyFieldAccess } from '@/plugins/access'
import { virtualFieldInputs } from '@/plugins/virtualFields'

import { pageParentField } from './parentField'
import { buildPagePath, buildPageWebPath, homePageId } from './webPath'

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
      //
      // ⚠ This re-resolves on every autosave, so do not swap the ancestor walk
      // for a tree load, as `buildEventWebPath` uses: Events have no autosave
      // and these pages save themselves every 60 seconds.
      url: async ({ data, locale, req }) =>
        livePreviewUrl({
          base: weMeditatePreviewUrl(),
          path: await buildPageWebPath({
            slug: data?.slug,
            parent: data?.parent,
            locale: locale.code,
            req,
          }),
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
    slugField({
      useAsSlug: 'title',
      collectionSlug: 'pages',
      // The home page, served at `/`, keeps `''` — a WeMeditateWeb contract
      // (`src/globals/AGENTS.md`).
      blankAllowed: async ({ originalDoc, req }) => {
        if (originalDoc?.id == null) return false
        return (await homePageId(req)) === originalDoc.id
      },
    }),
    pageParentField,
    {
      // Not published-gated, unlike the three public links below: its reader is
      // the sidebar beside the picker above, which has to answer before anyone
      // publishes. Gating it would buy a consumer nothing either — a client
      // reads no unpublished page at all.
      name: 'path',
      type: 'text',
      virtual: true,
      // Declares what the hook reads, or an include-mode `select` naming `path`
      // alone strips `parent` before it runs and the field answers null (#1084).
      custom: virtualFieldInputs('slug', 'parent'),
      admin: {
        position: 'sidebar',
        readOnly: true,
        disableListColumn: true,
        disableListFilter: true,
        description: 'Where this page is served, as of the last save.',
      },
      hooks: {
        afterRead: [
          ({ data, req }) => buildPagePath({ slug: data?.slug, parent: data?.parent, req }),
        ],
      },
    },
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
      // Where each service's configuration places this page, and which one to
      // name it in. A notice rather than a column: nothing stores it, and
      // `webUrl` and `appUrl` are what a consumer reads the answer from.
      name: 'availability',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/PageAvailability' },
      },
    },
    {
      // Document-level access: managers listed here can read + update this page
      // even without role-based access (see src/plugins/access/documentManagers.ts).
      // ⚠ Listing someone here also grants them the derived `page-editor` role
      // (config/roles.ts), so assigning editors stays admin-only.
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
    // Virtual deep links: public web URL + in-app URL, each only for a page its
    // service places (`exposeWhen`). Both require the page to be published
    // (gate built into publicUrlFields). Web path carries the optional locale,
    // then the slug.
    //
    // ⚠ **The segments are the ancestors' slugs, then this page's — and no tag.**
    // WeMeditateWeb routes a page at its nested address (sydevs/WeMeditateWeb#333),
    // and its sitemap publishes the same shape. A **tag** segment is a different
    // thing and is still never emitted: this used to publish `[locale, tag, slug]`,
    // which no site has ever served. The legacy Rails site does not serve it
    // either — its articles live at `/articles/<slug>` and `wisdom` appears only
    // as `/inspiration/wisdom`, a category index (checked against production,
    // 2026-09-15). So every tagged page published a `webUrl` that 404s, while
    // untagged ones worked, which is why it went unnoticed. `buildPageWebPath`
    // below is also what the live-preview URL is built from, so the panel would
    // have landed on those same 404s.
    ...publicUrlFields({
      // Raw `process.env`, deliberately: this callback runs per read, so the
      // late bind is what lets a spec stub the base with `vi.stubEnv`. The
      // guard already degrades to `null` rather than interpolating `undefined`,
      // which is the failure mode `serverEnv` exists to prevent elsewhere.
      web: () => (process.env.WEMEDITATE_WEB_URL ? `${process.env.WEMEDITATE_WEB_URL}/` : null),
      app: 'wemeditate://',
      // All three deep links read `slug`, and an include-mode `select` strips
      // it before the afterRead field hooks run — so `?select[webUrl]=true`
      // answered null for every published page (#1084). The publish gate's own
      // `_status` is added by the factory; `tags` is what places a page in a
      // service beside its configuration (`exposeWhen`).
      inputs: ['slug', 'tags', 'parent'],
      buildPath: ({ platform, data, req }) => {
        // The app deep-links by bare slug — it hands `webUrl` to a WebView
        // verbatim for four config pages, so a nested one needs no app release,
        // but `appUrl` is a route the app resolves itself and stays one segment.
        //
        // The web path is shared with the live-preview panel through
        // `buildPageWebPath`, so the two cannot drift. See that module for why
        // the locale is passed, not read.
        if (platform === 'app') {
          return typeof data?.slug === 'string' && data.slug.length > 0 ? data.slug : null
        }
        return buildPageWebPath({ slug: data?.slug, parent: data?.parent, locale: req.locale, req })
      },
      // Beyond the factory's publish gate, each link needs its page placed in
      // that service by the service's own configuration — a `webUrl` for a page
      // the website never reads is an address that 404s.
      exposeWhen: async ({ platform, data, req }) =>
        isPagePlaced(data ?? {}, await loadServicePages(req, platform)),
    }),
  ],
}
