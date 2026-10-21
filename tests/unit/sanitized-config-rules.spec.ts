import type { Block, Field } from 'payload'

import { flattenTopLevelFields } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { sourceOf, SRC } from '../utils/importGraph'

/**
 * Two rules that hold over every collection and global, asserted by walking the
 * sanitized config rather than by naming the components and fields that happen
 * to break them today.
 *
 * `meditation-transcript-tab-wiring` and `upload-notice-coverage` each used to
 * pin one component's path into the import map by hand. The rule was never
 * about those two: every registration resolves there or someone skipped
 * `pnpm generate:importmap`, and the two hand-written cases covered 2 of 61.
 *
 * `@/payload.config`'s default export is **already sanitized** — `buildConfig`
 * sanitizes, so this awaits it and calls nothing. Passing it to `sanitizeConfig`
 * a second time throws `DuplicateCollection: payload-kv`. The sanitized config
 * is also the only input that sees a plugin's registrations: `UploadNotice` and
 * the four `EventImport` components arrive during a plugin fold, so the raw
 * `collections` array would miss them.
 *
 * It costs about 6.5 s and opens no database connection, which is why each case
 * carries its own timeout — the config import alone exceeds vitest's 5 s
 * default.
 */

const CASE_TIMEOUT_MS = 60_000

/**
 * Measured on `main` at 9eedacf: 62 distinct registration strings, which are 61
 * distinct paths — one carries a `#NamedExport` — found over 687 occurrences,
 * the Lexical block set repeating per field. The floor sits below that to
 * absorb a deleted component, and far above the vacuum a walk that stopped at
 * the wrong key would pass with.
 */
const MIN_REGISTRATIONS = 55

const IMPORT_MAP = `${SRC}/app/(payload)/admin/importMap.js`

/**
 * Every string under an `admin.components` subtree that names a component in
 * this repo.
 *
 * Both registration shapes are caught without naming either, because the walk
 * reads strings rather than keys: a bare path, and the `{ path, clientProps }`
 * form an edit-view slot needs. A vendor registration
 * (`@payloadcms/richtext-lexical/...`) is that package's own to resolve, and is
 * left out.
 */
function registrationsOn(node: unknown, inComponents = false, depth = 0): Set<string> {
  const found = new Set<string>()

  const visit = (value: unknown, within: boolean, level: number): void => {
    if (level > 40) return

    if (typeof value === 'string') {
      if (within && value.startsWith('@/components')) found.add(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, within, level + 1)
      return
    }
    if (!value || typeof value !== 'object') return

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      visit(nested, within || key === 'components', level + 1)
    }
  }

  visit(node, inComponents, depth)
  return found
}

/**
 * The key `generate:importmap` writes for a registration. A path carrying no
 * `#NamedExport` is registered by its default export, which is why an
 * unstripped comparison counts 62 paths where the map holds 61.
 */
const importMapKey = (registration: string): string => {
  const [path, exported] = registration.split('#')
  return `"${path}#${exported ?? 'default'}"`
}

const blocksOf = (field: Field): Block[] => {
  if (field.type !== 'blocks') return []
  // `blockReferences` is Payload's by-slug form. Nothing here declares one
  // today, so the fallback is what actually runs — both are read rather than
  // asserting which shape sanitization leaves behind.
  const references = (field as { blockReferences?: (Block | string)[] }).blockReferences
  return [...(references ?? []), ...field.blocks].filter(
    (block): block is Block => typeof block !== 'string',
  )
}

type Namespace = { fields: Field[]; label: string }

/**
 * Every `ui` field whose name is already taken in the namespace it sits in.
 *
 * Payload refuses a repeated name itself — `sanitizeFields` throws
 * `DuplicateFieldName` — but only where `fieldAffectsData` is true, and that is
 * `'name' in field && field.type !== 'ui'`. So a data-field collision is already
 * a boot failure and needs no spec, and a `ui` field sharing a name with a
 * sibling is the one shape that reaches production. `transcriptPanel` is named
 * as it is so it cannot shadow the `transcript` join.
 *
 * `flattenTopLevelFields` answers what one namespace holds, so this does not
 * restate the flattening rules: with hoisting off, a row, a collapsible and an
 * unnamed group or tab give up their children to the level above, while a named
 * group, an array, a named tab and a blocks field stay whole and open one of
 * their own. `keepPresentationalFields` is on here, which is the whole point —
 * the default drops exactly the fields under test.
 */
function uiNameClashes({ fields, label }: Namespace): string[] {
  const members = flattenTopLevelFields(fields, true)
  const taken = new Map<string, number>()

  for (const member of members) {
    const name = 'name' in member ? member.name : undefined
    if (name) taken.set(name, (taken.get(name) ?? 0) + 1)
  }

  const clashes = members
    .filter((member) => member.type === 'ui')
    .flatMap((member) => {
      const name = 'name' in member ? member.name : undefined
      return name && (taken.get(name) ?? 0) > 1 ? [`${label} > ${name}`] : []
    })

  const nested: Namespace[] = members.flatMap((member) => {
    const name = 'name' in member && member.name ? member.name : member.type
    if (member.type === 'blocks') {
      return blocksOf(member).map((block) => ({
        fields: block.fields,
        label: `${label} > ${name} > ${block.slug}`,
      }))
    }
    return 'fields' in member && Array.isArray(member.fields)
      ? [{ fields: member.fields, label: `${label} > ${name}` }]
      : []
  })

  return [...clashes, ...nested.flatMap(uiNameClashes)]
}

const namespaces = async (): Promise<Namespace[]> => {
  const sanitized = await config
  return [
    ...sanitized.collections.map((collection) => ({
      fields: collection.fields,
      label: `collection ${collection.slug}`,
    })),
    ...sanitized.globals.map((global) => ({
      fields: global.fields,
      label: `global ${global.slug}`,
    })),
  ]
}

describe('every admin component registration resolves in the import map', () => {
  it(
    'finds the registrations, so the assertion below cannot pass by vacuum',
    async () => {
      const sanitized = await config
      const found = registrationsOn([sanitized.collections, sanitized.globals, sanitized.admin])

      expect(found.size).toBeGreaterThanOrEqual(MIN_REGISTRATIONS)
    },
    CASE_TIMEOUT_MS,
  )

  it(
    'resolves every one of them',
    async () => {
      const sanitized = await config
      const found = registrationsOn([sanitized.collections, sanitized.globals, sanitized.admin])
      const map = sourceOf(IMPORT_MAP)

      const missing = [...found].filter((registration) => !map.includes(importMapKey(registration)))

      expect(missing).toEqual([])
    },
    CASE_TIMEOUT_MS,
  )
})

describe('no ui field shares a name with a sibling', () => {
  it(
    'walks every collection and global',
    async () => {
      expect((await namespaces()).length).toBeGreaterThan(20)
    },
    CASE_TIMEOUT_MS,
  )

  it(
    'finds no clash',
    async () => {
      expect((await namespaces()).flatMap(uiNameClashes)).toEqual([])
    },
    CASE_TIMEOUT_MS,
  )
})
