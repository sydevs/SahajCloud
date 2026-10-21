---
paths:
  - src/components/admin/**/*.tsx
  - src/components/branding/**/*.tsx
  - src/globals/**/*.ts
  - src/collections/**/*.ts
  - src/fields/**/*.ts
  - src/lib/richEditor/blocks/**/*.ts
---

# Admin UI

Rules for PayloadCMS admin-panel components: server vs client, field components, cells, project visibility, and the frame editor.

## Prefer Payload's built-in components

**Before building or styling any admin UI, check whether `@payloadcms/ui` already exports it, and use that.** A custom component is a maintenance burden and drifts from the CMS's look and feel. Write a custom-styled component only when no built-in fits, and say so in the PR (what was missing).

Import directly from `@payloadcms/ui` (e.g. `import { Banner, Button, Pill } from '@payloadcms/ui'`). See `node_modules/@payloadcms/ui/dist/exports/client/index.d.ts` for the full set.

⚠ **`ProgressBar` is exported, and it reads as though it should show a job's count.** It is the route-transition bar: it takes no props and reads its value from `RouteTransitionProvider`, so it cannot show a job's own count. A job's count belongs in `JobStageView`'s banner instead (below), which is where both consumers put it and why this repo now renders no bar of its own. For a determinate bar, should one be wanted again, use a native `<progress>` — it carries the value to assistive technology, which no styled div does, and `max={0}` is invalid, so an unknown total means omitting both attributes rather than passing zero.

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
{
  selected !== null && <Drawer slug={slug}>{body}</Drawer>
}

// ✅ mounts closed, animates on open — and returns null while closed, so it costs nothing
;<Drawer slug={slug}>{selected === null ? null : body}</Drawer>
```

There is no width prop: `Drawer` sets `width: calc(100% - (drawerDepth * var(--gutter-h)))` in JS, narrowing one gutter per nesting level. A narrower drawer needs a `className` and a CSS rule.

### A hidden collection is still reachable through a `join`

`admin.hidden: true` removes a collection from the nav **and** unregisters its routes — `/admin/collections/<slug>/<id>` 404s. It does not make the documents unreachable: a `join` field on another collection still renders its rows and opens each in a document drawer, which never touches the route. Nested drawers work from there too.

That combination is often what you want — reachable where it's explained, absent from the sidebar. An event's registrations are read this way, through the join on its Registrations tab rather than the collection's own list. A 404 on the route is not evidence a field needs surfacing elsewhere — try the surfaces that already embed the document first.

### `WorkflowButtons` — stage-dependent document buttons as data

`src/components/admin/WorkflowButtons/` replaces a bespoke button component per staged collection. A collection declares its buttons through `clientProps` on an edit-view slot:

```ts
admin.components.edit.SaveButton = {
  path: WORKFLOW_BUTTONS,
  clientProps: {
    statusField: 'status', // the form field whose value picks the stage
    onlyWhen: { field: 'type', equals: 'proposal' }, // optional: otherwise the fallback
    fallback: null, // 'publish' | 'save' | 'saveDraft' | null
    stages: { [CREATE_STAGE]: [{ label: 'Next step', overrides: { _status: 'draft' } }] },
  } satisfies WorkflowButtonsProps<MyStage>,
}
```

Each action is `{ label, overrides, confirm?, buttonStyle?, skipValidation? }`; `overrides` is merged into the submit, so `{ status: 'committing' }` is how a button makes a transition and `{}` is a plain save. Five rules:

- **`clientProps`, not `admin.custom`.** An edit-view slot is not a field, so there is no `field.admin.custom` to read, and `createClientCollectionConfig` strips a collection's top-level `custom`. `renderDocumentSlots` passes a `RawPayloadComponent`'s own `clientProps` through — which is why each declaration is an object rather than a path string.
- **An empty stage array is not a missing one.** `[]` renders nothing; a stage the declaration never names falls through to `fallback`. Collapsing the two put Publish back on Meditations' create screen.
- **An unsaved document is `CREATE_STAGE`, whatever the status field holds.** A collection that defaults `status` to a running stage would otherwise hand the create form that stage's buttons.
- **The contract lives in `stages.ts`, not beside the component.** Every export of a `'use client'` module reaches a server module as a client reference, so a config reading `CREATE_STAGE` off the component would key its map on an object. Same split as `UserSubmissions/statuses.ts`.
- **A slot serving several kinds of document needs `onlyWhen`.** It reads a second form field and renders `fallback` unless that field holds the declared value, whatever stage the status names. `user-submissions` holds four intakes sharing one status vocabulary, so a `contact` row at `pending` resolves the same stage as a proposal awaiting review — and without the gate would be offered Accept and Reject. The gate outranks a stage declared `[]` too, so a gated-out row falls back to its Save button rather than losing it.

**A button is an offer, never a permission, so the server owes its own guard.** `admin.readOnly` on a status column is the admin UI alone, and a field access rule that admits managers admits every manager's `PATCH`. `user-submissions` pairs its declaration with `guardStatusTransition` (which moves a reviewer may make) and `applyReviewDecision` (what each one then does), both reading one `reviewMove` predicate — see `src/plugins/formBuilder/AGENTS.md`. Build the `stages` map from whatever the server's own rule reads, rather than listing the statuses again: a hand-written map can offer a button the guard then refuses. `stagesFor(statuses, buttons)` in `stages.ts` is that spread — `{ ...stagesFor(OPEN_REVIEW_STATUSES, REVIEW_BUTTONS), accepted: [] }`.

**Building a custom field component?** Compose Payload's primitives (`FieldLabel`, `FieldError`, `FieldDescription`, `RenderFields`, the `*Field` inputs) instead of bespoke markup.

For non-admin (public) React, use `lucide-react` instead (see `docs/code-style.md`). Emails use neither — see `docs/rules/email.md`.

## A condition reads a sibling its own level declares

`siblingData` is the data at the field's own level, and `Condition` types it as `any`, so a name no level declares compiles, is always false, and hides the field it guards for good — `wisdomStyle` read the legacy `position` for its whole life (#989). `row`, `collapsible` and an unnamed `group` or `tab` hold no data, so a field inside one still reads its parent's level; a named `group`, `array`, `tab` or block starts a level of its own. A `ui` field is declared but holds no data, so its name is not a sibling either.

`tests/unit/admin-condition-fields.spec.ts` fails on a read that names nothing at the level that owns it. It reads the condition's own source text, so a condition reading a sibling must spell its parameter `siblingData` — rename it, destructure it, or hand it to a helper and the spec fails rather than cover nothing. The one exempt spelling is `_siblingData`, which is how a condition declares it reads no sibling at all. `data` and `blockData` are out of its scope: neither names a sibling.

## Live preview pushes the document — the frontend needn't fetch it

Payload posts the edited document's form state into the preview iframe on every change:

```js
const values = reduceFieldsToValues(formState, true)
iframeRef.current.contentWindow?.postMessage(
  { type: 'payload-live-preview', collectionSlug, data: values },
  url,
)
```

Most preview routes here ignore that and re-fetch by `?collection=…&id=…` instead — fine for Events/Regions/Pages, but a _choice_, not a requirement, and it costs preview on anything the frontend can't read: a **restricted** collection (API clients hold create-only on `user-submissions`), or a document with **no id to fetch** (a submission proposing a brand-new event).

For those, carry the render-ready shape in a field and let postMessage deliver it: `UserSubmissions.previewEvent` is a virtual JSON field holding the merged event, and the widget renders from the message. Relationship hydration still fetches by id, so a referenced doc must stay readable by the client.

Two mechanics worth knowing:

- **Open the panel with `livePreview.openByDefault: true`** (Payload 3.86+), not a mount effect. It applies server-side while building the document view, only until the user toggles the panel — after that their stored `editViewType` preference wins. A `setIsLivePreviewing(true)` effect can't honour that, and re-opened the panel every time a reviewer closed it. The proposal review surface was ported off exactly such an effect. A _tab_ still needs the client, and declares `autoOpen` instead — see below.
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

Declared today in `translationsSchema.json` (a `preview` key beside `screenshot`, read on top-level groups only) and on the Meditations frame and Transcript tabs, which declare `autoOpen` with no path.

## Styling — PayloadCMS CSS variables

**Always use PayloadCMS CSS variables** for theme compatibility. A hardcoded color or pixel size breaks the elevation scale.

Full reference: `node_modules/@payloadcms/ui/dist/scss/app.scss`

## Server vs client components

Payload passes user data and locale objects with methods to view components, so **custom views must be server components** — a client view throws `Functions cannot be passed directly to Client Components` the moment Payload hands it a locale object.

## Performance — direct Payload access

A server component has direct DB access via `getPayload()`. Don't fetch internal data over HTTP from a client component. Reserve `fetch()` for external APIs.

⚠ **When a client component calls an `/api/*` path whose gate is per-locale, it sends `useLocale().code`.** A request naming no locale resolves to the default locale, and role gates are per-locale — so a manager with no English roles is denied (#701). Not every hand-rolled fetch qualifies: `docs/rules/access.md`, "What a check with no locale means", names the condition and lists the call sites on each side of it.

## Component organization

Group a component family (main plus sub-components) in a folder with a barrel. Keep a standalone component as a single file. A barrel export **must include a default export** — Payload imports by name.

A module several components share, rather than one a collection registers, goes in `admin/helpers/`. The root of `admin/` is for what Payload mounts.

## Import map generation

After registering a component in `payload.config.ts` (`admin.components`), run `pnpm generate:importmap`. Every registered component needs a default export. Path aliases (`@/`) work via tsconfig. The generated file (`src/app/(payload)/admin/importMap.js`, from `admin.importMap.baseDir` in `src/payload.config.ts`) is auto-managed — never hand-edit it.

## Custom field components

- **Destructure typed props**: `const { name, label, localized, options: fieldOptions, admin: { description } = {} } = field as SelectFieldClient`.
- **`useField`**: path is inferred from `FieldPathContext` for a simple field — don't pass it. **Exception**: an `ArrayFieldClientComponent` must pass `path` from props, so the hook tracks the current path during row reordering.
- **`Option` is `string | OptionObject`** — normalize with a small map. A string becomes `{ label: opt, value: opt }`. An object's `label` falls back to its `value`.
- **A `StaticLabel` may be a string or a locale map** — for an aria-label, read the string directly, or `label['en'] || Object.values(label)[0] || name`.
- **Markup**: wrap in `<FieldLabel>` / a `field-type__wrap` div holding `<FieldError>` and your input / `<FieldDescription>`. Base class `field-type` (not `field`), plus a type class (`select`, `text`) and state classes (`error`, `read-only`). Use Payload's `FieldLabel`/`FieldError`/`FieldDescription` rather than rolling your own, and match the markup of Payload's built-in fields.

## Custom cell components (list views)

Prefer **`DefaultServerCellComponentProps`** — it gets `payload`, can read collection labels, can use Next.js `<Link>`, and ships no client JS. Use **`DefaultCellComponentProps`** only when the cell needs a hook, an event handler, or a browser API.

A **join field**'s `cellData` is a structured object, not a scalar: `{ docs: Array<{ id, ... }>, totalDocs?, limit? }` — read `cellData.docs?.length` for a count. A label can be `string | LabelFunction | Record<string, string>`. Extract it with a small helper that checks each shape and lowercases the result. Reference: `src/components/admin/RelationshipCountCell/RelationshipCountCell.tsx`.

⚠ **A custom `Cell` that can be a collection's first column must handle list-drawer selection itself**: Payload gives `onSelect` to its own `DefaultCell` only, and the select has to outrank any `onClick` prop (#942, #944). `SelectableCell` (`src/components/admin/helpers/drawerRowSelect.tsx`) is that rule, and the whole of it — render the cell's content as its children, and pass a cell's own link as `fallback` and its own click as `onClick`, so neither reaches a selected row. A cell wrapping another must forward `link`, which is what stands for "this is the linked column". Which column that is comes from each user's saved column preference, so a cell second by default still has to handle this.

Do not reach for the two seams that look like they would spare a cell this. Both live inside the component a custom `Cell` replaced, so neither is reachable: `useCellProps()` answers `null` because `CellPropsContext` is provided only in `RenderDefaultCell`, and `LinkedCellOverride` is settable only from `RelationshipTable`. The whole convention stands in for a Payload defect that is unreported upstream, so nothing retires it yet — #964 holds that report.

⚠ **`renderCell` hands a custom cell neither `onClick` nor `className`.** `baseCellClientProps` declares no such key, so both read as `undefined` on every input — take neither from props, and give a cell that needs its own click a prop of its own. `SelectableCell`'s button restores the text properties `className` would have carried, since nothing else does.

A **server** cell keeps its `payload` prop by splitting rather than converting: `RelationshipCountCell` resolves the count and the URL, then renders `RelationshipCountLink`, a client child taking serializable props only.

`tests/unit/custom-cell-drawer-select-coverage.spec.ts` walks every `Cell:` registration and fails on one that reaches no `SelectableCell`, so a new custom cell cannot forget this quietly.

## Component wrapper pattern (pure UI + field wrapper)

For a complex interactive component, separate a stateless, PayloadCMS-free **pure UI component** (independently testable) from a **field wrapper** that calls `useField`, fetches data, and wraps the UI in field markup.

**Default-value alignment is the critical pitfall**: the wrapper must default the same way Payload's underlying field type does (e.g. `hasMany = false` for a relationship field), even when the standalone UI component defaults differently for its own convenience. A wrapper with no explicit default silently passes `undefined` where the UI component expected `true`.

Examples of the pattern, each a folder holding `<Name>.tsx` beside `<Name>Field.tsx` under whichever of the two names reads better: **`TagSelector/`** (visual tag picker), **`RangeSlider/`** (discrete slider on `react-range`), **`TableOfContentsField/`** (headings read out of the Lexical editor). Reach for this shape for a multi-select, drag-drop, or visual picker, for a component fetching its own data, or for one that might be reused outside Payload.

## Configurable components via `admin.custom`

`field.admin.custom` accepts any JSON-serializable data, so one component can serve many fields without a code change.

## Closing the Edit view while a job owns a document — `JobStageView`

A collection whose rows a background job writes needs editing closed while the job runs, or the admin form posts a whole stale document over the worker's writes. `JobStageView` (`src/components/admin/JobStageView/`) is that view, generic over the collection.

`runningStages` is required; `statusField` (default `status`), `progressField` and `totalField` are dotted paths, so a count kept inside a group is reachable. `staleAfterMs` is how long a running stage may stand against `updatedAt` before the form opens anyway — declare one wherever a run can be lost to a restart, since nothing expires a stage and the gate is otherwise permanent. Declare `totalField` wherever the job knows its denominator — the banner reads "7 of 20 done" with one and "7 done so far" without. Declare with `satisfies JobStageConfig` — `admin.custom` is `Record<string, any>`, so that is the only thing that makes a misspelled key a build error rather than a view that never fires.

Four things are load-bearing:

- **`views.edit.default.Component` replaces `DefaultEditView`; it does not wrap it.** So a settled stage falls through by rendering `DefaultEditView` itself.
- **The stored stage at page load is the whole input.** There is no poll, so nothing re-requests the document. **Check again** (`CheckAgain.tsx`, the folder's one client component) calls `router.refresh()`, which refetches the route's server render and bypasses the client router cache a `next/link` navigation can be answered from. That is Payload's own idiom — `useRouteCache`'s `clearRouteCache` is the same call. ⚠ Inside a document drawer nothing re-reads the stage: `DocumentDrawerContent` renders the document through the `renderDocument` server function and keeps the result in React state, which no route refresh re-runs. An anchor would re-read it only by leaving the host document and discarding its unsaved edits, so the refresh stands in both surfaces.
- **The gate releases itself only where `staleAfterMs` is declared.** Without one, a row whose worker died stays behind the waiting view for good; past the window the form opens and setting the status column back to its queued value is the retry.
- **Never name a running stage that is also the column's `defaultValue`** — unless the create genuinely queues the job. `meditation-transcripts` declares `processing` and not `queued`, because a queued row waits for a person. `imports` declares its own default `pending`, because its create hook queues the import job, so a saved row at that default really is one a worker owns. Either way the release is `staleAfterMs`: without it, a saved row at that default opens behind a view nothing can move on. The view refuses to fire with no document id, which covers the create form alone.
- **A stage with no form has no `SaveButton` slot either.** The view replaces the whole form, so a `WorkflowButtons` stage declared for a running status is reachable only past `staleAfterMs`.

`imports` — the bulk class import's upload collection (`src/plugins/eventImport/importCollection.ts`) — declares `runningStages: ['pending']` with no count. Its job leaves `pending` in one write, with the results (`src/plugins/eventImport/finish.ts`), so the page never opens on a finished import whose rows are not stored yet. After that, a hook on `events` moves it between review and completed as its drafts are published or deleted.

⚠ **A `hidden: true` collection cannot show it on a route.** Registering the view is still correct there, and a document drawer renders it (`overrideEntityVisibility`), but `/admin/collections/<slug>/<id>` 404s — see "A hidden collection is still reachable through a `join`" above. Reach such a collection through a `join` before concluding the view is broken.

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

The Managers `currentProject` field stores the selection. `ProjectSelector` (`beforeNavLinks`) updates it on change, then reloads the page — `window.location.reload()` re-evaluates every `admin.hidden` function, since those run server-side off `user.currentProject` and hold no client state, then redirects to `/admin` so the user doesn't land on a now-hidden collection. `ProjectContext` (wrapped in `AdminProvider`) exposes `useProject()` and syncs with the user profile via `useAuth`.

**Atlas sidebar.** `admin.components.Nav` is overridden by `AtlasNav`, a server component. When `user.type === 'manager'` and `user.currentProject === 'sahaj-atlas'`, it renders a purpose-built `AtlasSidebar`. Everyone else falls through to Payload's `DefaultNav`. It reproduces the slide-in chrome from exported primitives (`NavWrapper`/`NavHamburger` are internal to `@payloadcms/next`), reuses `ProjectSelector`/`AdminNavLinks`/`Logout`, and adds two panels: the manager's own events, bucketed by stage and collapsible past 8, and the owned-region subtree as an indented, expandable tree with a published/total count pill per node. Data comes from a server-only fetch wrapped in `unstable_cache`, keyed by manager and locale, invalidated by `revalidateAtlasSidebar()` from the Events/Regions change hooks — a server component with direct Payload access, per this file's own rule above.

## Project visibility (collection sidebar filtering)

`accessPlugin` auto-generates `admin.hidden` for every collection and global. **Never hand-write project visibility — let the plugin do it.** A collection may still hand-write `admin.hidden`, and the plugin composes it (`accessPlugin.ts`): `true` hides the collection outright (`Songs`, `Users`, `MeditationTranscripts`), and a function is asked first, with project visibility applied only when it returns false. A global's own `admin.hidden` is overwritten.

Project assignments live in the internal `PROJECTS` constant (`src/plugins/access/config/projects.ts`). Add a collection to a project by editing its `collections:` array there. Lookup tables recompute automatically.

Page, video, and image tags are inline enum selects, not separate collections.

## Frame editor

`src/components/admin/FrameEditor/` manages audio-synced frames on the Meditations collection, integrated with Live Preview. `FrameListManager` (edit/reorder/remove) and `FrameInserter` (browse/insert at the current playback time) sit under a Video tab's Manage/Insert sub-tabs. Both tabs declare `autoOpen` through `previewTargetField`, which replaced a `useLivePreviewAuto` mount effect. A `PLAYBACK_TIME_UPDATE` postMessage from the iframe drives the active-frame highlight — **accepted from the preview iframe's origin only**, because that playhead is the timestamp a newly inserted frame is written at. Each subscription names the origin it will hear from (`usePlaybackTime`, reading `iframeRef`), so the permission belongs to a mounted component instead of to a flag someone has to clear; with no iframe there is no subscription. The same `iframeRef` carries `SEEK_TO_TIME` back. Inserting at an occupied timestamp replaces rather than throws.

Frames filter by narrator gender automatically, with category pills for the visible library. Two layers gate frames, and only one of them errors. On Meditations the `frames` validator returns `'At least one frame is required'`, on update only and never on create — which is what refuses a publish with no frames. Its `beforeChange` hook silently drops any entry with no id or a negative or non-finite timestamp, then sorts the rest; `afterRead` rounds each timestamp and enriches it with its Frame collection details. Duplicate timestamps are allowed here, as is one frame at several times — whole numbers, no duplicates and the one-hour cap are `validateTimestamp`'s rules in the editor alone.

Tests: `tests/int/meditationFrames.int.spec.ts` (validation, sorting, enrichment, publish rules), `tests/int/frames-by-narrator.int.spec.ts` (the `framesByNarrator` auth gate, gender-matched results, sort order).
