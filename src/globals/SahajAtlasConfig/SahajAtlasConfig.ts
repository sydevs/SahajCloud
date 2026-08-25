import type { GlobalConfig } from 'payload'

import { ATLAS_DEFAULT_LOCALES } from '@/lib/atlas/defaultLocales'
import { getLocaleOptions } from '@/lib/locales'

export const SahajAtlasConfig: GlobalConfig = {
  slug: 'sy-atlas-config',
  admin: {
    group: 'Sahaj Atlas',
  },
  label: 'Configuration',
  fields: [
    {
      name: 'languages',
      label: 'Languages',
      type: 'array',
      required: true,
      minRows: 1,
      // ⚠ **Named `languages`, not `locales`, and that is load-bearing.** A
      // sub-table on a global is named `<global_table>_<field>`, and Payload
      // already uses the `_locales` suffix for a localized document's value
      // table — so a field called `locales` here generates
      // `sy_atlas_config_locales`, collides with that convention, and every
      // read of this global then dies in Drizzle's relation builder with
      // `Cannot read properties of undefined (reading 'referencedTable')`.
      // Reproduced with `select`+`hasMany`, with an array, and with the array
      // localized; renaming the field is what fixes it.
      //
      // An array of one select rather than `select` + `hasMany` is incidental
      // to that — either shape works once the name is free — but the array is
      // kept because it is the shape proven elsewhere on a global here.
      fields: [
        {
          name: 'code',
          label: 'Language',
          type: 'select',
          required: true,
          // The CMS's own locales, so a language the content isn't translated
          // into can never be offered here. What the *widget* can render is a
          // separate constraint it owns (a shipped UI bundle per language) — it
          // must ship one for everything enabled here, which
          // sydevs/SahajAtlasWeb asserts in CI rather than at runtime.
          options: getLocaleOptions(),
        },
      ],
      defaultValue: ATLAS_DEFAULT_LOCALES.map((code) => ({ code })),
      admin: {
        description:
          'Languages the atlas is offered in. Drives the widget’s language picker and the ' +
          'hreflang links on every atlas page, so removing one tells search engines that ' +
          'language is gone. Adding one needs a matching translation bundle in the widget — ' +
          'check with a developer first.',
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
