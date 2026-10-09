---
paths:
  - src/components/admin/**/*.tsx
  - src/components/branding/**/*.tsx
  - src/globals/**/*.ts
---

# Admin UI

Rules for PayloadCMS admin-panel components: server vs client, field components, cells, branding, dashboard, project visibility, and the frame editor.

## Prefer Payload's built-in components

**Before building or styling any admin UI, check whether `@payloadcms/ui` already exports it, and use that.** A custom component is a maintenance burden and drifts from the CMS's look and feel. Write a custom-styled component only when no built-in fits, and say so in the PR (what was missing).

Import directly from `@payloadcms/ui` (e.g. `import { Banner, Button, Pill } from '@payloadcms/ui'`). This is a curated list. See `node_modules/@payloadcms/ui/dist/exports/client/index.d.ts` for the full set.

| Need | Use |
|---|---|
| Inline notice / callout | `Banner` (`type` default/error/success, plus `icon`) |
| Status / tag chip | `Pill`, `ErrorPill` |
| Tabular data | `Table` (columns + `renderedCells`), `OrderableTable` |
| Buttons / actions | `Button`, `SaveButton`, `PublishButton`, `SaveDraftButton`, `CopyToClipboard` |
| Cards / layout | `Card`, `Gutter`, `Collapsible`, `AnimateHeight` |
| Tooltip / popover | `Tooltip`, `Popup`, `PopupList` |
| Modals / drawers | `Drawer` + `useModal`/`useDrawerSlug`, `ConfirmationModal`, `FullscreenModal` |
| Loading | `Spinner` (icon + `loadingText`), `LoadingOverlay`, `ProgressBar`, `ShimmerEffect` |
| Pagination / list | `Pagination`, `PerPage`, `ListControls` |
| Drag & drop | `DraggableSortable`, `DraggableSortableItem` |
| Uploads | `Dropzone`, `Upload`, `FileDetails` |
| Toasts | `toast` |
| Icons | `WarningIcon`/`ErrorIcon`/`InfoIcon`/`SuccessIcon` plus `CalendarIcon`, `CheckIcon`, `ChevronIcon`, `CopyIcon`, `EditIcon`, `ExternalLinkIcon`, `GearIcon`, `PlusIcon`, `SearchIcon`, `XIcon`, … |

`Table` is list-view-shaped: pass `data` (rows with an `id`) and `columns: Column[]`, each column carrying pre-rendered `renderedCells` (one node per row), `accessor`, and `active: true`. `Column` also requires a `field` the component never reads — stub it (`field: {} as never`). See `src/components/admin/LogTable/` for the working pattern, and note what it hand-rolls: `Table` exposes nothing per row, so opening a row's detail needs a delegated `closest('tr[data-id]')` listener (Payload writes the row's `id` there), and `cursor` must be a stylesheet rule because it targets Payload's own `<tr>`.

### A multipart save renders its own feedback

Payload publishes the state and renders nothing for it. `Form` holds `processing` and exposes it through `useFormProcessing()`; `<Upload>` reads that hook only to reset its remove-file state, and no `upload` option covers progress. So between submit and the response a document with a file attached shows a faded button and nothing else, which on a large file reads as a frozen page (#888).

`UploadNotice` (`src/components/admin/UploadNotice/`) is that feedback, a `Spinner` shown while `useFormProcessing()` is true **and** form state's `file` path holds a `File`. Neither half alone is the signal: processing is equally true of a save posting no file, and `data-form-ready` is also false while the form initializes.

`storagePlugin` appends it to `admin.components.edit.beforeDocumentControls` for every collection with `upload` set (`src/plugins/storage/uploadNotice.ts`), so a new upload collection needs no wiring. ⚠ It is applied **above** that plugin's two early returns, because a save still posts a file with the plugin disabled and with the Cloudflare credentials absent — local dev, the test suite, `migrate:create`.

⚠ **A replacement `edit.Upload` component receives no props at all.** Payload reads the node off `useDocumentInfo().Upload` and renders it bare, so everything its own call sites pass must be re-sourced. `initialState` is the one that bites: it is optional, so omitting it compiles and looks right on the edit view, but `<Upload>` sets `fileSrc` from it on mount and gates the whole staged-file block — thumbnail, filename, remove, crop — on `value && fileSrc`. The Bulk Upload drawer stages each file into its own form rather than clicking, so without it that drawer shows an empty box. `AudioUpload` takes it from `useDocumentInfo()` for exactly this reason. `UploadControls` and `customActions` arrive as **props** and sit on no context, so they cannot be re-sourced at all.

⚠ **`<Upload>`'s `UploadControls` slot cannot carry a notice about a save.** It renders inside the dropzone, and the dropzone gives way to the staged-file preview the moment a file is chosen — so the slot is empty exactly when the notice is needed.

### `Drawer` must mount unconditionally, or it won't animate

`Drawer` seeds `animateIn` from `modalState[slug].isOpen` with `useState`, read **once at mount**, then adds `drawer--is-open` in a layout effect. A drawer rendered behind a condition that turns true in the same tick as `openModal` mounts **already open**: the class is on its first paint, so it reads as a styling bug rather than a mounting one.

```tsx
// ❌ mounts already-open; no slide
{selected !== null && <Drawer slug={slug}>{body}</Drawer>}

// ✅ mounts closed, animates on open — and returns null while closed, so it costs nothing
<Drawer slug={slug}>{selected === null ? null : body}</Drawer>
```

There is no width prop: `Drawer` sets `width: calc(100% - (drawerDepth * var(--gutter-h)))` in JS, narrowing one gutter per nesting level. A narrower drawer needs a `className` and a CSS rule.

### A hidden collection is still reachable through a `join`

`admin.hidden: true` removes a collection from the nav **and** unregisters its routes — `/admin/collections/<slug>/<id>` 404s. It does not make the documents unreachable: a `join` field on another collection still renders its rows and opens each in a document drawer, which never touches the route. Nested drawers work from there too.

That combination is often what you want — reachable where it's explained, absent from the sidebar. An event's registrations are read this way, through the join on its Registrations tab rather than the collection's own list. A 404 on the route is not evidence a field needs surfacing elsewhere — try the surfaces that already embed the document first.

**Building a custom field component?** Compose Payload's primitives instead of bespoke markup: `FieldLabel`, `FieldError`, `FieldDescription`, plus input fields (`TextField`, `SelectField`, `RelationshipField`, `UploadField`, `ArrayField`, `GroupField`, `BlocksField`, and more) and `RenderFields` (a whole field set). Hooks: `useField`, `useForm`, `useFormFields`, `useDocumentInfo`, `useConfig`, `useAuth`, `useTranslation`.

For non-admin (public) React, use `lucide-react` instead (see `docs/code-style.md`). Emails use neither — see `docs/rules/email.md`.

## Live preview pushes the document — the frontend needn't fetch it

Payload posts the edited document's form state into the preview iframe on every change:

```js
const values = reduceFieldsToValues(formState, true)
iframeRef.current.contentWindow?.postMessage(
  { type: 'payload-live-preview', collectionSlug, data: values }, url,
)
```

Most preview routes here ignore that and re-fetch by `?collection=…&id=…` instead — fine for Events/Regions/Pages, but a *choice*, not a requirement, and it costs preview on anything the frontend can't read: a **restricted** collection (API clients hold create-only on `user-submissions`), or a document with **no id to fetch** (a submission proposing a brand-new event).

For those, carry the render-ready shape in a field and let postMessage deliver it: `UserSubmissions.previewEvent` is a virtual JSON field holding the merged event, and the widget renders from the message. Relationship hydration still fetches by id, so a referenced doc must stay readable by the client.

Two mechanics worth knowing:

- **Open the panel with `livePreview.openByDefault: true`** (Payload 3.86+), not a mount effect. It applies server-side while building the document view, only until the user toggles the panel — after that their stored `editViewType` preference wins. A `setIsLivePreviewing(true)` effect can't honour that, and re-opened the panel every time a reviewer closed it. The proposal review surface was ported off exactly such an effect. A *tab* still needs the client, and declares `autoOpen` instead — see below.
- A field that only carries data to the iframe wants `admin.hidden: true`, not a component rendering `null` — Payload renders it as a `HiddenField`, so the value still sits in form state (what `reduceFieldsToValues` posts) while nothing takes up space on the page.
- A **virtual** field's value computes on read, so it never recomputes as the user types — the right trade only when the document isn't editable, as in the submission-review case.

## Repointing the preview per tab — `previewTargetField`

`admin.livePreview.url` receives `{ collectionConfig, data, globalConfig, locale, payload, req }` and runs on the server, so it can never see which tab is open. `previewTargetField(target, name)` (`src/fields/previewTargetField.ts`) is the seam that can: a zero-height `ui` field whose component repoints the panel through `useLivePreviewContext().setURL`. Declare it on a tab and it applies while that tab is open — `TabsField` mounts only the active tab's content.

Five rules, each of which cost something to learn:

- **Tab granularity only.** A sub-group renders as a collapsible, and a collapsed collapsible still mounts its fields, so a target inside one fires for every sub-group at once.
- **`admin.custom`, never top-level `custom`** — Payload strips the latter from the client field config. And because it is serialized, the declaration is data: `{ path?, params?, autoOpen? }`, never a callback.
- **A targeted global's `livePreview.url` reads `locale` and never `data`.** Payload overwrites the panel's URL whenever the server-resolved one changes, so a data-dependent URL re-resolves mid-edit and clobbers the repoint. `tests/int/translations-globals.int.spec.ts` calls each URL with no document, which is how that stays true.
- **The declaration carries no origin and no credential.** It ships to the browser. `composeTargetUrl` rewrites the server-resolved default instead — keeping its origin and its query, the edited `locale` included — and refuses any target that would land on another origin. A relative `path` resolves against that default, which is how a locale-prefixed site keeps its prefix; an absolute one replaces the whole path.
- **A targeted global's URL is a view, and sends no preview secret.** Both facts are the same fact: a consumer's `/preview` boot route wants a `collection` and an `id`, and it is also the only route that reads a `secret` — and the only one that scrubs it from the address bar. Point a global there with no document and the panel shows "Save this document to preview it." over a click-swallowing overlay on every untargeted tab, with a live credential parked in the URL beside it. So both translations globals point at a rendered page (the Atlas root, the site's home page in the edited locale) and send only `locale`. A repointed panel therefore shows **published** copy; sydevs/SahajAtlasWeb#198 and sydevs/WeMeditateWeb#80 are the routes that would open a draft session from a view path, and the secret goes back when one of them lands. `tests/int/translations-globals.int.spec.ts` holds both halves.

The component renders `null` rather than taking `admin.hidden: true`: a hidden field renders Payload's own `HiddenField`, and this one exists to run an effect, not to carry a value into form state.

Declared today in `translationsSchema.json` (a `preview` key beside `screenshot`, read on top-level groups only) and on the three Meditations Video tabs, which declare `autoOpen` with no path.

## Styling — PayloadCMS CSS variables

**Always use PayloadCMS CSS variables** for theme compatibility. A hardcoded color or pixel size breaks the elevation scale.

| Variable | Purpose |
|---|---|
| `--base` | Base spacing unit (`calc(...)`) |
| `--gutter-h` | Horizontal gutter |
| `--base-body-size` | Base font size (13 — use as `calc(var(--base-body-size) * 1px)`) |
| `--font-body`, `--font-serif`, `--font-mono` | Font stacks |
| `--theme-elevation-{0-1000}` | Elevation color scale (auto light/dark) |
| `--theme-bg`, `--theme-text`, `--theme-input-bg` | Background / text / input |
| `--style-radius-s/m/l` | Border radius (6 / 8 / 12 px) |
| `--nav-width` | Sidebar width (275) |
| `--app-header-height`, `--doc-controls-height` | Layout heights |

Full reference: https://github.com/payloadcms/payload/tree/main/packages/ui/src/scss

## Server vs client components

**Server components** (no `'use client'`) are preferred. They accept non-serializable props (a locale object with methods, a user object) and have direct `getPayload()` access. **Client components** (`'use client'`) are for React hooks, event handlers, or browser APIs — props must be JSON-serializable.

Payload passes user data and locale objects with methods to view components, so **custom views must be server components** — a client view throws `Functions cannot be passed directly to Client Components` the moment Payload hands it a locale object.

## Performance — direct Payload access

A server component has direct DB access via `getPayload()`. Don't fetch internal data over HTTP from a client component. Reserve `fetch()` for external APIs.

⚠ **When a client component calls an `/api/*` path whose gate is per-locale, it sends `useLocale().code`.** A request naming no locale resolves to the default locale, and role gates are per-locale — so a manager with no English roles is denied (#701). Not every hand-rolled fetch qualifies: `docs/rules/access.md`, "What a check with no locale means", names the condition and lists the call sites on each side of it.

```typescript
const payload = await getPayload({ config })
// payload.count() is cheaper than payload.find() for counts
const [meditationsCount] = await Promise.all([payload.count({ collection: 'meditations' })])
```

## Component organization

Group a component family (main plus sub-components) in a folder with a barrel. Keep a standalone component as a single file. A barrel export **must include a default export** — Payload imports by name.

```
src/components/
├── admin/
│   ├── SelectDescription.tsx        # standalone
│   ├── Dashboard/                   # family → folder + barrel
│   └── ThumbnailCell/
├── branding/                        # branding components, barrel
└── AdminProvider.tsx                # provider wrapping admin UI
```

## Import map generation

After registering a component in `payload.config.ts` (`admin.components`), run `pnpm generate:importmap`. Every registered component needs a default export. Path aliases (`@/`) work via tsconfig. The generated file (`.next/payload-component-map.json`) is auto-managed — never hand-edit it.

## Custom field components

- **Destructure typed props**: `const { name, label, localized, options: fieldOptions, admin: { description } = {} } = field as SelectFieldClient`.
- **`useField`**: path is inferred from `FieldPathContext` for a simple field — don't pass it. **Exception**: an `ArrayFieldClientComponent` must pass `path` from props, so the hook tracks the current path during row reordering.
- **`Option` is `string | OptionObject`** — normalize with a small map. A string becomes `{ label: opt, value: opt }`. An object's `label` falls back to its `value`.
- **A `StaticLabel` may be a string or a locale map** — for an aria-label, read the string directly, or `label['en'] || Object.values(label)[0] || name`.
- **Markup**: wrap in `<FieldLabel>` / a `field-type__wrap` div holding `<FieldError>` and your input / `<FieldDescription>`. Base class `field-type` (not `field`), plus a type class (`select`, `text`) and state classes (`error`, `read-only`). Use Payload's `FieldLabel`/`FieldError`/`FieldDescription` rather than rolling your own, and match the markup of Payload's built-in fields.

## Custom cell components (list views)

Prefer **`DefaultServerCellComponentProps`** — it gets `payload`, can read collection labels, can use Next.js `<Link>`, and ships no client JS. Use **`DefaultCellComponentProps`** only when the cell needs a hook, an event handler, or a browser API.

A **join field**'s `cellData` is a structured object, not a scalar: `{ docs: Array<{ id, ... }>, totalDocs?, limit? }` — read `cellData.docs?.length` for a count. A label can be `string | LabelFunction | Record<string, string>`. Extract it with a small helper that checks each shape and lowercases the result. Reference: `src/components/admin/RelationshipCountCell/RelationshipCountCell.tsx`.

## Component wrapper pattern (pure UI + field wrapper)

For a complex interactive component, separate a stateless, PayloadCMS-free **pure UI component** (independently testable) from a **field wrapper** that calls `useField`, fetches data, and wraps the UI in field markup.

**Default-value alignment is the critical pitfall**: the wrapper must default the same way Payload's underlying field type does (e.g. `hasMany = false` for a relationship field), even when the standalone UI component defaults differently for its own convenience. A wrapper with no explicit default silently passes `undefined` where the UI component expected `true`.

Examples of the pattern, each a folder holding `<Name>.tsx` beside `<Name>Field.tsx` under whichever of the two names reads better: **`TagSelector/`** (visual tag picker), **`RangeSlider/`** (discrete slider on `react-range`), **`TableOfContentsField/`** (headings read out of the Lexical editor). Reach for this shape for a multi-select, drag-drop, or visual picker, for a component fetching its own data, or for one that might be reused outside Payload.

## Configurable components via `admin.custom`

`field.admin.custom` accepts any JSON-serializable data, so one component can serve many fields without a code change:

```typescript
{
  name: 'type', type: 'select',
  options: [{ label: 'Quick', value: 'quick' }, { label: 'Daily', value: 'daily' }],
  admin: {
    custom: { descriptions: { quick: 'Time-based.', daily: 'Personalized.' } },
    components: { Description: '@/components/admin/SelectDescription' },
  },
}
```

The component then reads `field.admin?.custom?.descriptions` by the current value. Common keys: `descriptions` (per-value help text), `columns` (LogTable), `filterQuery` (TagSelector API filtering), `size: 'default' | 'large'` (TagSelector).

## Custom array field components

Reach for `ArrayFieldClientComponent` only when the built-in `ArrayField` doesn't fit — flat rows, no per-row collapsibles, no drag-drop.

- `useField({ hasRows: true, path: pathFromProps })` returns `rows` (with `.id`), the current `path` (use this, not the stale `pathFromProps`, during reorder), and `showError`.
- `useForm()` gives `addFieldRow({ path, rowIndex, schemaPath })` and `removeFieldRow({ path, rowIndex })`.
- `useField` does **not** return `schemaPath` — derive it: `parentSchemaPath ? \`${parentSchemaPath}.${name}\` : name`.
- Thread `permissions` into `RenderFields` as `permissions === true ? permissions : (permissions?.fields ?? true)`.
- The `Button` component takes **no `style` prop** — wrap it in a `<div style={...}>` instead.

Reference implementation: `src/components/admin/FlatArrayField/FlatArrayField.tsx`.

## Label generation with `toWords`

`payload/shared`'s `toWords` converts camelCase/PascalCase to "Title Case With Spaces" (`toWords('pathProgress')` → `"Path Progress"`). Use it instead of a custom label derivation — `src/components/admin/LogTable/LogTable.tsx` writes `column.label ?? toWords(column.key)`. Not unconditional: `toWords('a11y')` is `"A11y"`, so a slug that is shorthand rather than words needs its own label (`src/fields/translationsField.ts`).

## `usePayloadAPI` and race conditions

See "Eliminating client-side race conditions" in `docs/rules/endpoints.md` — a custom Payload endpoint, not a chained `usePayloadAPI` + `useEffect`, is the fix for a client-side join.

## Project-aware navigation

| Project | Slug | Theme | Logo |
|---|---|---|---|
| All Content (admin view) | `null` | Default PayloadCMS | `sahaj-cloud.svg` |
| WeMeditate Web | `wemeditate-web` | Coral (#F07855) | `wemeditate-web.svg` |
| WeMeditate App | `wemeditate-app` | Teal (#61aaa0) | `wemeditate-app.svg` |
| Sahaj Atlas | `sahaj-atlas` | Royal blue (#4a8cd4) | `sahaj-atlas.webp` |

The Managers `currentProject` field stores the selection. `ProjectSelector` (`beforeNavLinks`) updates it on change, then reloads the page — `window.location.reload()` re-evaluates every `admin.hidden` function, since those run server-side off `user.currentProject` and hold no client state, then redirects to `/admin` so the user doesn't land on a now-hidden collection. `ProjectContext` (wrapped in `AdminProvider`) exposes `useProject()` and syncs with the user profile via `useAuth`.

**Atlas sidebar.** `admin.components.Nav` is overridden by `AtlasNav`, a server component. When `user.type === 'manager'` and `user.currentProject === 'sahaj-atlas'`, it renders a purpose-built `AtlasSidebar`. Everyone else falls through to Payload's `DefaultNav`. It reproduces the slide-in chrome from exported primitives (`NavWrapper`/`NavHamburger` are internal to `@payloadcms/next`), reuses `ProjectSelector`/`AdminNavLinks`/`Logout`, and adds two panels: the manager's own events, bucketed by stage and collapsible past 8, and the owned-region subtree as an indented, expandable tree with a published/total count pill per node. Data comes from a server-only fetch wrapped in `unstable_cache`, keyed by manager and locale, invalidated by `revalidateAtlasSidebar()` from the Events/Regions change hooks — a server component with direct Payload access, per this file's own rule above.

## Project-aware dashboard

Dashboard concerns sit in dedicated Payload slots:

```typescript
admin: {
  components: {
    beforeNavLinks: ['@/components/admin/ProjectSelector', '@/components/admin/AdminNavLinks'],
    beforeDashboard: ['@/components/admin/Dashboard/ProjectSelectionPrompt'],
    views: { analytics: { Component: '@/components/admin/AnalyticsView', path: '/analytics' } },
  },
}
```

`AnalyticsView` is a server component at `/admin/analytics`, wrapped in `DefaultTemplate`, routing by `currentProject`: `wemeditate-web` and `sahaj-atlas` each get a `FathomDashboard` with their own site id, and any other project sees "No analytics available". `ProjectSelectionPrompt` is a client component that self-guards via `useAuth()` and renders `null` unless its condition holds. CSP headers in `next.config.mjs` allow `https://app.usefathom.com` for the Fathom iframe.

## Project-based branding

`src/components/branding/` holds `Icon.tsx` (project icon, 30px default), `Logo.tsx` (stacked, 64px, login/signup), `InlineLogo.tsx` (horizontal, 48px, admin nav), and `ProjectTheme.tsx` (injects `--theme-elevation-*` per project, light and dark, via a `MutationObserver`, mounted by `AdminProvider`). All read the manager's `currentProject`.

`src/lib/branding/themeColors.ts` holds `PROJECT_BRAND_COLORS`, the `lighten`/`darken`/`tint`/`shade` utilities, and `deriveScalarTheme()` for the Scalar API docs theme.

| Project | Primary | Dark | Light |
|---|---|---|---|
| WeMeditate Web | `#F07855` | `#D86545` | `#FF9477` |
| WeMeditate App | `#61aaa0` | `#4c8d84` | `#72b3a9` |
| Sahaj Atlas | `#4a8cd4` | `#2d6db8` | `#6fa3dd` |

`next.config.mjs` allows images from `raw.githubusercontent.com` for We Meditate logo assets.

## Project visibility (collection sidebar filtering)

`accessPlugin` auto-generates `admin.hidden` for every collection and global. **Never hand-write `admin.hidden` — let the plugin do it.**

```typescript
hidden: ({ user }) => {
  if (!hasWritePermission(user, collectionSlug)) return true
  if (!projectsContainingCollection.length) return false  // shared
  if (!user.currentProject) return false                  // admin view
  return !projectsContainingCollection.includes(user.currentProject)
}
```

Project assignments live in the internal `PROJECTS` constant (`config/projects.ts`). Add a collection to a project by editing its `collections:` array there. Lookup tables recompute automatically.

| Collection / Global | wemeditate-web | wemeditate-app | sahaj-atlas |
|---|:-:|:-:|:-:|
| pages, meditations, songs, albums, videos | ✅ | ✅ | |
| lessons, lectures | | ✅ | |
| lecture-clips | | ✅ (sidebar-hidden) | |
| images, files | ✅ | ✅ | ✅ |
| narrators, frames | ✅ | ✅ | |
| authors | ✅ | | |
| audiences | | ✅ | |
| user-choices, song-tags | ✅ | ✅ | |
| forms | ✅ | | ✅ (admin-only — `atlas-manager` holds no write) |
| we-meditate-web-settings | ✅ | | |
| we-meditate-app-settings | | ✅ | |
| sahaj-atlas-settings | | | ✅ |

Page, video, and image tags are inline enum selects, not separate collections.

## Frame editor

`src/components/admin/FrameEditor/` manages audio-synced frames on the Meditations collection, integrated with Live Preview. `FrameListManager` (edit/reorder/remove) and `FrameInserter` (browse/insert at the current playback time) sit under a Video tab's Frames/Add New sub-tabs. Both tabs declare `autoOpen` through `previewTargetField`, which replaced a `useLivePreviewAuto` mount effect. A `PLAYBACK_TIME_UPDATE` postMessage from the iframe drives the active-frame highlight — **accepted from the preview iframe's origin only**, because that playhead is the timestamp a newly inserted frame is written at. Each subscription names the origin it will hear from (`usePlaybackTime`, reading `iframeRef`), so the permission belongs to a mounted component instead of to a flag someone has to clear; with no iframe there is no subscription. The same `iframeRef` carries `SEEK_TO_TIME` back. Inserting at an occupied timestamp replaces rather than throws.

Frames filter by narrator gender automatically, with category pills for the visible library. Collection-level validation on Meditations: timestamps are non-negative integers (rounded on save) with no duplicates, at least one frame is required when audio exists (on update), and frames are required to set `publishAt`. A `beforeChange` hook sorts frames by timestamp. `afterRead` enriches each with its Frame collection details. Shared helpers in `utils.ts`: `formatTime`, `parseTime`, `validateTimestamp`, `getCategoryLabel`.

Tests: `tests/int/meditationFrames.int.spec.ts` (validation, sorting, enrichment, publish rules), `tests/int/frames-by-narrator.int.spec.ts` (the `framesByNarrator` auth gate, gender-matched results, sort order).

### Transcript tab

`src/components/admin/MeditationTranscript/` is the first Video sub-tab, before Frames and Add New. It reads `GET /api/meditations/:id/transcript` and offers **Transcribe recording** through the `POST`, which queues the `transcribeMeditation` job (`src/jobs/TranscribeMeditation/`). It polls while a request is queued or processing. The transcript lives in the restricted `meditation-transcripts` collection, never on the meditation, so a transcription writes no meditation version.

It reuses the frame editor's preview bridge: `usePlaybackTime` highlights the phrase under the playhead and, inside it, the word being spoken. A click sends `SEEK_TO_TIME` to the phrase's whole second, the only resolution frame seeks have ever sent. `useFollowPlayhead` scrolls an off-screen playing phrase into view, and stops for 5 s after the editor scrolls by wheel, touch or key. A pause of 3 s starts a paragraph, and one of 10 s shows "A moment of silence" (`transcriptModel.ts`). Without `LEMONFOX_API_KEY`, any deployment but production writes a labelled sample transcript instead.

Tests: `tests/unit/meditation-transcript-model.spec.ts` (grouping, phrase and word highlight, phases), `tests/unit/lemonfox-response.spec.ts` (the response normalizer), `tests/int/meditation-transcript.int.spec.ts` (the endpoints' gates, the job, outdated audio).
