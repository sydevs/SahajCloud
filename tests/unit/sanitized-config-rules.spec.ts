import type { AdminViewConfig, Block, Field, SanitizedCollectionConfig } from 'payload'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { generateImportMap } from 'payload'
import { flattenTopLevelFields, parsePayloadComponent } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { readJobStageConfig } from '@/components/admin/JobStageView/stages'
import { isRecord } from '@/lib/utilities/isRecord'
import config from '@/payload.config'
import { depthParameter } from '@/plugins/openapi/clientReadParametersDocs'
import { CUSTOM_ENDPOINT_PATHS, CUSTOM_ENDPOINT_SCHEMAS } from '@/plugins/openapi/customEndpoints'
import { filterSpec, rootEndpointPathsFrom, type OpenAPISpec } from '@/plugins/openapi/specFilter'

import { entryAndDirectImports, resolveSpec, sourceOf, SRC } from '../utils/importGraph'

/**
 * Three rules that hold over every collection and global, asserted against the
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
 * It costs about 6.5 s and opens no database connection. That import is paid
 * once per worker, not per case, so the `await config` in each helper below is
 * on an already-settled promise.
 */

/** The config import alone exceeds vitest's 5 s default. */
const TIMEOUT = 60_000

const IMPORT_MAP = `${SRC}/app/(payload)/admin/importMap.js`

/**
 * What `pnpm generate:importmap` would write for this config, from Payload's
 * own generator — so nothing here decides a second time what a registration
 * is. That mattered: `iterateConfig` also reads `admin.avatar.Component`,
 * `admin.dependencies`, root `blocks` and any `importMap.generators`, none of
 * which sits under a key named `components`.
 *
 * The generator only writes, so it is pointed at a scratch file. Its output
 * does not depend on where that file sits as long as no registration is a
 * relative path: `addPayloadComponentToImportMap` prepends the map's path to
 * the base directory only for one starting `.` or `/`, and every registration
 * here is a tsconfig alias or a package.
 */
const generatedImportMap = async (): Promise<string> => {
  const sanitized = await config
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sahajcloud-importmap-'))
  const importMapFile = path.join(dir, 'importMap.js')

  await generateImportMap(
    {
      ...sanitized,
      admin: {
        ...sanitized.admin,
        importMap: { ...sanitized.admin.importMap, importMapFile },
      },
    },
    { force: true, log: false },
  )

  return await fs.readFile(importMapFile, 'utf-8')
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

describe(
  'the import map holds exactly the components the config registers',
  { timeout: TIMEOUT },
  () => {
    /**
     * Byte equality against the generator's own output. It reads from both
     * sides at once: a component registered without `pnpm generate:importmap`,
     * and an entry left behind for one nothing registers any more, are the same
     * failure. A spec is the home rather than a CI dirty-tree check so the
     * per-edit hook and the lean gate catch it before a push.
     */
    it('matches what generate:importmap would write', async () => {
      expect(await generatedImportMap()).toBe(sourceOf(IMPORT_MAP))
    })
  },
)

describe('no ui field shares a name with a sibling', { timeout: TIMEOUT }, () => {
  it('walks every collection and global', async () => {
    expect((await namespaces()).length).toBeGreaterThan(20)
  })

  it('finds no clash', async () => {
    expect((await namespaces()).flatMap(uiNameClashes)).toEqual([])
  })
})

/**
 * The view that cannot render without a readable declaration. The Transcript
 * panel is deliberately not here: it is registered on `meditations` but reads
 * `transcripts`' declaration, so a collection registering it owes
 * nothing. Its own two specs refuse to load if that declaration goes missing.
 */
const JOB_STAGE_VIEW = '@/components/admin/JobStageView/JobStageView'

const declaresJobStage = (custom: unknown): boolean => isRecord(custom) && 'jobStage' in custom

/**
 * Both registrations are the edit view's default, and reading that one slot is
 * what keeps this rule's claim to the view it is about. `parsePayloadComponent`
 * is Payload's own split, so a `#NamedExport` form is read the way the
 * generator reads it.
 */
const registersJobStageView = (collection: SanitizedCollectionConfig): boolean => {
  const component = collection.admin?.components?.views?.edit?.default?.Component
  return component !== undefined && parsePayloadComponent(component).path === JOB_STAGE_VIEW
}

describe('a declared job stage is a readable one', { timeout: TIMEOUT }, () => {
  /**
   * `admin.custom` is `Record<string, any>`, so `satisfies JobStageConfig`
   * catches a typo only where a collection remembered to write it. This is what
   * answers for one that did not: a misspelled key reads as no declaration at
   * all, which is a view that silently never fires.
   */
  it('parses on every collection that declares one', async () => {
    const sanitized = await config

    const malformed = sanitized.collections
      .filter((collection) => declaresJobStage(collection.admin?.custom))
      .filter((collection) => readJobStageConfig(collection.admin?.custom) === null)
      .map((collection) => collection.slug)

    expect(malformed).toEqual([])
  })

  it('is declared wherever JobStageView is registered', async () => {
    const sanitized = await config

    const unwired = sanitized.collections
      .filter(registersJobStageView)
      .filter((collection) => readJobStageConfig(collection.admin?.custom) === null)
      .map((collection) => collection.slug)

    expect(unwired).toEqual([])
  })

  /** The registration this rule is about exists, so neither case is vacuous. */
  it('finds the collections that register it', async () => {
    const sanitized = await config

    const registered = sanitized.collections.filter(registersJobStageView)

    expect(registered.map((collection) => collection.slug).sort()).toEqual([
      'imports',
      'transcripts',
    ])
  })
})

/**
 * `isCustomAdminView` skips `Root`'s auth redirect for every view declaring a
 * `path`, so the gate is the view's own (`requireAdminAccess`) and a view
 * registered without it is reachable unauthenticated. `docs/rules/admin-ui.md`
 * carries the rest (#1030).
 */
const ADMIN_ACCESS_GUARD = `${SRC}/components/admin/helpers/requireAdminAccess.ts`

/** A call, not a mention: an imported guard nobody calls must not satisfy this. */
const CALLS_GUARD = /requireAdminAccess\(/

/** Nor may a commented-out call, so comments come off before the match. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const pathBearingViews = async (): Promise<[string, AdminViewConfig][]> => {
  const sanitized = await config
  return Object.entries(sanitized.admin.components.views).filter(
    ([, view]) => view.path && view.path !== '/',
  )
}

/**
 * The view's own module and the ones it imports directly, because a
 * registration naming a folder resolves to its barrel rather than to the
 * component that calls the guard. One hop and no further: the whole graph
 * below a view would pass it on any reachable module's call. The guard's own
 * module is excluded: its definition matches `CALLS_GUARD` too, and would make
 * every importer green.
 */
const callsTheGuard = (view: AdminViewConfig): boolean => {
  const entry = resolveSpec(parsePayloadComponent(view.Component).path, IMPORT_MAP)
  if (!entry) return false

  return entryAndDirectImports(entry).some(
    (file) => file !== ADMIN_ACCESS_GUARD && CALLS_GUARD.test(withoutComments(sourceOf(file))),
  )
}

describe('every path-bearing admin view gates itself', { timeout: TIMEOUT }, () => {
  /** A scan finding nothing would make the assertion below pass by vacuum. */
  it('finds the registrations', async () => {
    expect((await pathBearingViews()).map(([key]) => key).sort()).toEqual(['analytics', 'map'])
  })

  /**
   * And so would a moved guard: the exclusion is a path, so renaming the module
   * would silence it, and then a view that merely imports the guard passes.
   */
  it('excludes a file that is really the guard', () => {
    expect(CALLS_GUARD.test(sourceOf(ADMIN_ACCESS_GUARD))).toBe(true)
  })

  it('calls requireAdminAccess from each one', async () => {
    const views = await pathBearingViews()

    expect(views.filter(([, view]) => !callsTheGuard(view)).map(([key]) => key)).toEqual([])
  })
})

/**
 * The Install tab's registration (#1055).
 *
 * ⚠ **A document view, not a root one.** `isCustomAdminView` — and the guard
 * above it — only reach `admin.components.views`, so nothing there covers this
 * one. Payload routes to a document view only with read access to the row,
 * which for `clients` is the document-manager path, and `InstallView` re-reads
 * the row with `overrideAccess: false` anyway because it reveals the API key.
 *
 * Pinned because the whole feature is one config key: a `path` lost in a
 * refactor leaves the tab unroutable with every test still green.
 */
describe('the Install tab is registered on clients', { timeout: TIMEOUT }, () => {
  const installView = async () => {
    const sanitized = await config
    const clients = sanitized.collections.find((collection) => collection.slug === 'clients')
    return (
      clients?.admin?.components?.views?.edit as
        | Record<string, { Component?: unknown; path?: string; tab?: { label?: unknown } }>
        | undefined
    )?.install
  }

  it('registers a document view at its own path', async () => {
    const view = await installView()
    expect(view).toBeDefined()
    expect(view?.path).toBe('/install')
  })

  it('labels the tab, or there is nothing to click', async () => {
    expect((await installView())?.tab?.label).toBe('Install')
  })

  it('names a component the import map resolves', async () => {
    const view = await installView()
    const path = parsePayloadComponent(view?.Component as never).path
    expect(resolveSpec(path, IMPORT_MAP), `${path} is not in the import map`).toBeTruthy()
  })
})

/**
 * The hand-written OpenAPI document for custom endpoints, held to the sanitized config. These live
 * here rather than in `openapi-custom-endpoints.spec.ts` so that only one spec pays the config
 * import; the rest of the OpenAPI rules stay there with no Payload config at all.
 */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/**
 * Payload spells a route parameter `:id`, OpenAPI `{id}`. A `.ics`-style suffix
 * after the OpenAPI parameter has no Payload spelling, so it is dropped too.
 */
const normalisePath = (path: string): string => path.replace(/\{[^}]+\}(\.\w+)?|:\w+/g, '{}')

/** `METHOD /api/path` for every custom endpoint the sanitized config registers. */
const registeredEndpoints = async (): Promise<Set<string>> => {
  const sanitized = await config
  const api = sanitized.routes.api
  const keys = new Set<string>()
  const add = (prefix: string, endpoints: false | readonly { method: string; path: string }[]) => {
    for (const endpoint of endpoints || []) {
      keys.add(`${endpoint.method} ${normalisePath(`${api}${prefix}${endpoint.path}`)}`)
    }
  }
  add('', sanitized.endpoints)
  for (const collection of sanitized.collections) {
    add(`/${collection.slug}`, collection.endpoints)
  }
  return keys
}

/** `payload-oapi` names a collection's generated schema by its PascalCased slug. */
const generatedSchemaNames = async (): Promise<Set<string>> =>
  new Set(
    (await config).collections.map((collection) =>
      collection.slug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(''),
    ),
  )

const collectRefs = (node: unknown, refs: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs)
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') refs.add(value)
      else collectRefs(value, refs)
    }
  }
  return refs
}

/** A fresh copy, so one case's filtering cannot leak into the next. */
const customSpec = (): OpenAPISpec =>
  JSON.parse(
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: { ...CUSTOM_ENDPOINT_PATHS },
      components: { schemas: { ...CUSTOM_ENDPOINT_SCHEMAS } },
    }),
  ) as unknown as OpenAPISpec

describe('custom endpoint document structure (OpenAPI)', () => {
  // `payload-oapi` generates nothing for a custom endpoint, so the document is
  // hand-written. A path left behind after its endpoint is renamed or deleted
  // sends an integrator to a 404.
  it(
    'documents only endpoints the config registers',
    async () => {
      const registered = await registeredEndpoints()
      const documented = Object.entries(CUSTOM_ENDPOINT_PATHS).flatMap(([path, item]) =>
        HTTP_METHODS.filter((method) => item[method]).map(
          (method) => `${method} ${normalisePath(path)}`,
        ),
      )
      expect(documented.length).toBeGreaterThan(0)
      expect(documented.filter((key) => !registered.has(key))).toEqual([])
    },
    TIMEOUT,
  )

  it(
    'resolves every $ref to a component that exists',
    async () => {
      const generated = await generatedSchemaNames()
      const unresolved = [...collectRefs([CUSTOM_ENDPOINT_PATHS, CUSTOM_ENDPOINT_SCHEMAS])].filter(
        (ref) => {
          const name = /^#\/components\/schemas\/(.+)$/.exec(ref)?.[1]
          return !name || !(name in CUSTOM_ENDPOINT_SCHEMAS || generated.has(name))
        },
      )
      expect(unresolved).toEqual([])
    },
    TIMEOUT,
  )
})

describe('depth parameter (OpenAPI)', () => {
  // The documented `maximum` must track the server `maxDepth` so REST clients
  // see the real cap.
  it(
    'caps depth at the server maxDepth',
    async () => {
      expect(depthParameter.schema.maximum).toBe((await config).maxDepth)
      expect(depthParameter.schema.minimum).toBe(0)
    },
    TIMEOUT,
  )
})

describe('root endpoints in the filtered spec (OpenAPI)', () => {
  // Read from the config, so a documented root endpoint added later is held to
  // the same rule without another case.
  const documentedRootPaths = async (): Promise<string[]> =>
    rootEndpointPathsFrom((await config).endpoints).filter((path) => path in CUSTOM_ENDPOINT_PATHS)

  const operationsOf = (spec: OpenAPISpec, path: string): Record<string, unknown>[] => {
    const item = spec.paths?.[path] as Record<string, Record<string, unknown>> | undefined
    expect(item, `${path} is missing from the filtered spec`).toBeDefined()
    return HTTP_METHODS.filter((method) => item![method]).map((method) => item![method]!)
  }

  it(
    'stays visible in every project spec despite owning no collection',
    async () => {
      // A root endpoint names no collection, so without the root-path exemption
      // the project tier reads it as "not in this project" and hides it everywhere.
      const paths = await documentedRootPaths()
      expect(paths).toContain('/api/atlas/seo')
      expect(paths).toContain('/api/atlas/sitemap')
      const rootEndpointPaths = paths
      for (const project of ['sahaj-atlas', 'wemeditate-web', 'wemeditate-app'] as const) {
        const filtered = filterSpec(customSpec(), { project, rootEndpointPaths })
        for (const path of paths) {
          for (const operation of operationsOf(filtered, path)) {
            expect(operation['x-internal'], `${path} hidden for ${project}`).toBeFalsy()
          }
        }
      }
    },
    TIMEOUT,
  )

  it(
    'is hidden when the caller does not declare it as a root path',
    async () => {
      const filtered = filterSpec(customSpec(), { project: 'sahaj-atlas' })
      for (const path of await documentedRootPaths()) {
        for (const operation of operationsOf(filtered, path)) {
          expect(operation['x-internal'], `${path} published without the exemption`).toBe(true)
        }
      }
    },
    TIMEOUT,
  )
})
