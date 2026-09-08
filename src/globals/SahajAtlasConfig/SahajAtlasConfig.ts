import type { GlobalConfig } from 'payload'

import { availableLocalesField } from '@/fields/availableLocalesField'

export const SahajAtlasConfig: GlobalConfig = {
  slug: 'sy-atlas-config',
  admin: {
    group: 'Sahaj Atlas',
  },
  label: 'Configuration',
  fields: [
    availableLocalesField({
      translationsSlug: 'sy-atlas-translations',
      description:
        'Languages the atlas is offered in. Drives the widget\u2019s language picker and the ' +
        'hreflang links on every atlas page. A language can only be selected once the Sahaj ' +
        'Atlas translations are published in it. Adding one also needs a matching translation ' +
        'bundle in the widget \u2014 check with a developer first.',
    }),
    {
      name: 'canonicalFallbackClient',
      label: 'Canonical Fallback Client',
      type: 'relationship',
      relationTo: 'clients',
      // An **override**, never a replacement (#652). A region with no owning
      // ancestor falls back to the We Meditate surface, which is asserted by
      // `WEMEDITATE_WEB_URL` + `WEMEDITATE_ATLAS_BASE_PATH` and is therefore the
      // one canonical target nobody verifies. Naming a client here puts it
      // through the same pipeline as every other owner — the URL comes from
      // `canonical.verification.verified`, written by the verification job from
      // what it observed on the live page — and, because ownership then covers
      // the whole tree, gives those regions a sitemap to appear in.
      //
      // Unset, or naming a client that cannot publish a canonical, leaves the
      // env-var fallback exactly as it was.
      admin: {
        description:
          'The client that owns every atlas page no other client claims — normally We Meditate. ' +
          'It must be published, have canonical ownership switched on, and have a verified ' +
          'embed; until all three hold, those pages keep the built-in We Meditate URLs and ' +
          'appear in no sitemap. Once all three hold, this also moves those pages’ canonical ' +
          'URLs onto the address that client’s embed was last verified at, in place of the ' +
          'built-in one — most of the atlas at once, and with no preview. ' +
          'Leave this empty to keep the built-in behaviour.',
      },
    },
    {
      name: 'defaultMapCenter',
      label: 'Default Map Center',
      type: 'group',
      fields: [
        {
          name: 'latitude',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
        {
          name: 'longitude',
          type: 'number',
          required: true,
          defaultValue: 0,
        },
      ],
    },
    {
      name: 'defaultZoomLevel',
      label: 'Default Zoom Level',
      type: 'number',
      min: 1,
      max: 20,
      defaultValue: 10,
    },
  ],
}
