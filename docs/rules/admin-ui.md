---
paths:
  - src/components/admin/**/*.tsx
  - src/components/branding/**/*.tsx
---

# Admin UI

Rules for writing a PayloadCMS admin component: built-ins first, server vs client, field components, cells, styling, and custom views. Admin settings on a collection, global or field config are in `docs/rules/admin-config.md`; navigation and the dashboards in `docs/rules/admin-navigation.md`; `WorkflowButtons`, `JobStageView` and the frame editor in the `AGENTS.md` beside each.

## Prefer Payload's built-in components

**Before building or styling any admin UI, check whether `@payloadcms/ui` already exports it, and use that.** A custom component is a maintenance burden and drifts from the CMS's look and feel. Write a custom-styled component only when no built-in fits, and say so in the PR (what was missing).

Import directly from `@payloadcms/ui` (e.g. `import { Banner, Button, Pill } from '@payloadcms/ui'`). See `node_modules/@payloadcms/ui/dist/exports/client/index.d.ts` for the full set.

⚠ **`ProgressBar` is exported, and it reads as though it should show a job's count.** It is the route-transition bar: it takes no props and reads its value from `RouteTransitionProvider`, so it cannot show a job's own count. A job's count belongs in `JobStageView`'s banner instead (`src/components/admin/JobStageView/AGENTS.md`), which is where both consumers put it. A determinate bar is `Progress` (`src/components/admin/Progress/`), the one this repo draws — the Install tab's and launch readiness's: a rounded track and fill drawn as divs, since each browser paints a native `<progress>` its own way, carrying `role="progressbar"` and its `aria-value*` so assistive technology still reads the value. A total of nothing draws an empty bar.

**A notice is `InfoBanner`** (`src/components/admin/InfoBanner/`): Payload's `Banner` with an icon, a title and a sentence or two. **Its one control is its typed `action`**, drawn as a small secondary `Button` after the text — `{ label, href }` for a link, which a server component can pass, or `{ label, onClick, disabled? }` for a handler. It takes no `ReactNode`, so a banner's control cannot be styled one way here and another there; never put a button or link in a banner's children, or beside it.

Registered as a `ui` field, it is configured through `admin.custom`, which is serialized — so its words are fixed and it takes no action. `Events.verificationGuide` is the worked example.

**A banner whose words depend on data is a component of its own composing `InfoBanner`**, because `admin.custom` cannot carry a function. Where the data is decides which kind: stored data is a server `ui` field, which owes the read gate below (`EventRegistrations/RegistrationsNotice`, counting an event's recent signups); live form state is a client one, which reads it with `useFormFields` and so follows each unsaved change (`EventScheduleNotice`).

`Table` is list-view-shaped: pass `data` (rows with an `id`) and `columns: Column[]`, each column carrying pre-rendered `renderedCells` (one node per row), `accessor`, and `active: true`. `Column` also requires a `field` the component never reads — stub it (`field: {} as never`), which `tableColumn`, inside `stackedTable.tsx`, is the one place doing so. See `src/components/admin/LogTable/` for the working pattern, and note what it hand-rolls: `Table` exposes nothing per row, so opening a row's detail needs a delegated listener resolving the row by its position in `<tbody>`, and `cursor` must be a stylesheet rule because it targets Payload's own `<tr>`.

⚠ **`Table` has no responsive mode — it scrolls sideways**, so a column past the edge is a column nobody finds on a phone. `StackedTable` (`src/components/admin/helpers/stackedTable.tsx`) is the wrapper that answers it: under 700px each row becomes one block, and each cell carries its own heading as a label, because the header row then names the first row alone. The first column takes no label, being the row's own title. Reach for it rather than restating either half in a stylesheet — a table that stacks with no labels reads as unnamed values, which is the defect it exists for.

**Every surface rendering Payload's `Table` goes through it**, and `tests/unit/stacked-table-coverage.spec.ts` fails a second renderer of it. ⚠ **Four surfaces hand-roll a `<table>` and the guard cannot see them** — `PermissionsTable`, `ReadinessField/ReadinessTable`, `NotificationPreferencesField`, `AtlasPreview/AdjustedColors`. Each sizes its own markup, so stacking one is its own reading, and only an import of Payload's `Table` fails the guard. The wrapper neutralises the widths a `td` carries — `width: 1%` on a narrow column included — at `.stacked .table td`, which outranks a surface's own two-class rule. ⚠ **A CSS module grouping `#heading-x` with `.cell-x` is the exception**: the build collapses a selector list to `:is(…)`, which takes the id's specificity, so such a rule survives the wrapper and the surface keeps its own stacked reset (`Dashboard.module.css`). A plain stylesheet's list does not collapse.

Two more things a surface still owes. A control the table keeps in its **header row** is unreachable once `thead` is hidden, so the phone gets its own — the import results' select-all sits beside Publish and Clean Up. And a width on the cell's own _content_ is lifted inside `@media (max-width: 700px)`, never scoped to `min-width: 701px`: a fractional viewport width falls between the two.

### A join can list more than its `on` resolves — `RelationshipTable`

A `join` resolves one reverse lookup, so a tab that must list rows reached through an ancestor chain cannot get them from `on`. `RelationshipTable` is the element Payload's own `JoinField` renders, and it is exported: it takes a `filterOptions: Where` of your choosing, re-queries through the `getTableState` server function under the reader's own access, and keeps the columns, pagination and document drawers a join table has. So a custom `Field` on the join renders the wider list with nothing hand-rolled.

`RegionEvents` (`src/components/admin/RegionEvents/`) is the worked example: `events.region` takes a city or a venue, so a country's Events tab is empty under `on: 'region'`, and the component swaps in `region: { in: descendantRegionIds(…) }`. Three things it has to do itself, because replacing the `Field` replaces all of them: render the join's `Label`, pass `parent`, and seed `initialDrawerData` for an Add New the picker's own `filterOptions` would accept — which is why `allowCreate` follows the **stored** level. ⚠ The stored join still answers `on` for every API reader, so the widening is the admin table's alone, and `clientField` arrives with `type` optional while the element requires it.

### A multipart save renders its own feedback

Payload publishes the state and renders nothing for it. `Form` holds `processing` and exposes it through `useFormProcessing()`; `<Upload>` reads that hook only to reset its remove-file state, and no `upload` option covers progress. So between submit and the response a document with a file attached shows a faded button and nothing else, which on a large file reads as a frozen page (#888).

`UploadNotice` (`src/components/admin/UploadNotice/`) is that feedback, a `Spinner` shown while `useFormProcessing()` is true **and** form state's `file` path holds a `File`. Neither half alone is the signal: processing is equally true of a save posting no file, and `data-form-ready` is also false while the form initializes.

`storagePlugin` appends it to the document controls of every collection with `upload` set (`src/plugins/storage/uploadNotice.ts`), so a new upload collection needs no wiring. ⚠ It is applied **above** that plugin's `cloudStoragePlugin` call, because a save still posts a file with the plugin disabled and with the Cloudflare credentials absent — local dev, the test suite, `migrate:create`.

⚠ **A replacement `edit.Upload` component receives no props at all.** Payload reads the node off `useDocumentInfo().Upload` and renders it bare, so everything its own call sites pass must be re-sourced. `initialState` is the one that bites: it is optional, so omitting it compiles and looks right on the edit view, but `<Upload>` sets `fileSrc` from it on mount and gates the whole staged-file block — thumbnail, filename, remove, crop — on `value && fileSrc`. The Bulk Upload drawer stages each file into its own form rather than clicking, so without it that drawer shows an empty box. `AudioUpload` takes it from `useDocumentInfo()` for exactly this reason. `UploadControls` and `customActions` arrive as **props** and sit on no context, so they cannot be re-sourced at all.

⚠ **`<Upload>`'s `UploadControls` slot cannot carry a notice about a save.** It renders inside the dropzone, and the dropzone gives way to the staged-file preview the moment a file is chosen — so the slot is empty exactly when the notice is needed.

### A blank live-preview panel says why

`LivePreviewNotice` (`src/components/admin/LivePreviewNotice/`) points the panel at the explanation page when a frame never completes Payload's handshake — an ad blocker, a network block, or the consumer being down — rather than leaving a blank rectangle (#1204). `previewNoticePlugin` mounts it on every entity declaring `admin.livePreview`, so a new preview surface declares nothing.

⚠ **Both notices mount through `appendDocumentControl` (`src/lib/admin/documentControls.ts`), and a global's slot is not a collection's.** `renderDocumentSlots` reads `edit.beforeDocumentControls` on a collection and `elements.beforeDocumentControls` on a global, so the other spelling type-checks, ships, and mounts nothing. One helper, not a copy per plugin.

⚠ **Three things point a panel at `/live-preview-unavailable`, and `src/lib/livePreview/unavailable.ts` is the one vocabulary all three draw from.** The server resolves a `ServerResolvedReason` into `admin.livePreview.url` through `livePreviewUrl`; a tab declares a `PanelComposedReason` on `previewTargetField`; `LivePreviewNotice` composes one when the handshake never lands. The two client paths both go through `composePanelNotice` (`src/components/admin/helpers/panelUrl.ts`), which is the only browser-side way to put an explanation in the panel. **The two halves of the vocabulary must stay disjoint**: `trackPanelUrl` tells a URL a component composed from one the server resolved by comparing the text, so a reason emitted from both sides makes the two byte-identical, and the panel's recorded default then stays the previous document's — a tab's repoint would compose against that document's origin. The split is what states it and `live-preview-unavailable.spec.ts` what pins it.

`appIsReady` is the signal, and it is per-address only because the component clears it on an address change: Payload clears it in the context's own `setURL`, but a URL the **server** re-resolved — every save — reaches the provider through the raw state setter beside it.

⚠ **An entity whose consumer mounts no live-preview subscriber declares `admin.custom.livePreviewSubscribes: false` beside its `livePreview`**, or its working preview is called blocked after the budget. It is an opt-**out**: a new surface is covered by declaring nothing. Four do — the three scoped globals, whose consumers mount a subscriber only for an unscoped session, and `lectures`, whose WeMeditateWeb route renders `LectureTemplate` bare. The panel URL cannot answer this, which is why the entity does. `lectures` is the one parked entry: sydevs/WeMeditateWeb#287 mounts that subscriber, and the line comes out with it.

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

**Building a custom field component?** Compose Payload's primitives (`FieldLabel`, `FieldError`, `FieldDescription`, `RenderFields`, the `*Field` inputs) instead of bespoke markup.

For non-admin (public) React, use `lucide-react` instead (see `docs/code-style.md`). Emails use neither — see `docs/rules/email.md`.

## Styling — PayloadCMS CSS variables

**Always use PayloadCMS CSS variables** for theme compatibility. A hardcoded color or pixel size breaks the elevation scale.

Full reference: `node_modules/@payloadcms/ui/dist/scss/app.scss`

⚠ **A project theme sets all 21 elevation steps, never a subset.** The scales live in `src/lib/branding/themeColors.ts`, derived from the brand colours beside them: a step a theme leaves unset keeps Payload's own grey, so muted text renders grey between two tinted neighbours. A text step carries 30% of the project hue's chroma, because at full chroma a read-only value reads as selected rather than muted. `tests/unit/project-theme-contrast.spec.ts` holds what a hex cannot show — every step set, and a dark text step readable on the surface behind it.

⚠ **`--theme-success-*` is a green here, and a chosen control is painted from `--project-accent`.** Payload ships a blue under the name `success`, so a verified pill and a filled bar read as a second brand colour — and as the Atlas's own. `ProjectTheme` repaints that scale from one green hue under every project, keeping each of Payload's steps at the luminance it had, so no consumer's contrast moves. The accent is the project's own `dark` brand variant, with `--project-accent-text` as the label over it: Payload's chosen-control pair is the elevation scale's dark end, which under a project theme is a near-black chip. Both are read with a fallback — a project-less admin paints neither.

⚠ **Payload's stylesheet sits in a cascade layer and `custom.scss` does not, so a rule there outranks anything Payload declares, whatever the specificity.** That is what puts the focus ring back over Payload's own `a:focus { outline: none }`. It also means a rule there that broadens one of Payload's — colouring every tab label, say — silently outranks Payload's narrower one for the error state, which then has to be restated beside it.

⚠ **So `custom.scss` may name only what Payload's own stylesheet names.** Unlayered also means a selector that stops matching stops silently — the rule never applies and the page still renders — so a renamed class or a dropped variable surfaces a release later, on the one screen the rule was for. `tests/unit/admin-custom-css.spec.ts` pins every class and variable the sheet spells against the CSS both Payload packages ship, and four `:root` overrides had already outlived their variables. A class Payload renders but never styles cannot be pinned, so the group-divider rule matches the wrapper's position instead of its name.

⚠ **One variable is this repo's own, and the admin's font sizes read it: `--admin-body-size`.** Payload's `--base-body-size` is read both ways in its own sheets — bare by three buttons, multiplied by `1px` by the spinner — so no value satisfies both spellings. Overriding it with a length made every `calc(var(--base-body-size) * Npx)` here a length times a length, which is invalid at computed-value time: the browser dropped 58 declarations across 23 files, each rendering at its inherited size with nothing to see (#1144). So size admin text as `calc(var(--admin-body-size) * N)` with a unitless factor, leave Payload's variable at its default, and declare a new token of our own in `OUR_VARIABLES` in that spec, which pins both halves.

⚠ **And a variable Payload declares per breakpoint has to be overridden per breakpoint.** One flat `:root` value cancels every narrowing below it, which is a desktop gutter on a phone — so the sheet restates `--gutter-h` inside Payload's own small break, and that spec pins the query's width and the value to Payload's `$breakpoint-s-width` and `base()`.

## Server vs client components

Payload passes user data and locale objects with methods to view components, so **custom views must be server components** — a client view throws `Functions cannot be passed directly to Client Components` the moment Payload hands it a locale object.

## A custom view that declares a `path` owes its own auth gate

⚠ **A view registered in `admin.components.views` with a `path` is reachable without `canAccessAdmin`.** `Root` guards its own `handleAuthRedirect` with `!isCustomAdminView(...)`, and that helper matches on `view.path` alone — it reads no `public` flag, whatever its docstring says. Nothing local signals the difference: the gate turns on a config detail with no marker at the component (#1030).

So call `requireAdminAccess(initPageResult)` first thing in such a view (`src/components/admin/helpers/requireAdminAccess.ts`). It redirects to the unauthorized view for a signed-in user and to the login view otherwise, each carrying the refused route — query included — back as `redirect`. `tests/unit/sanitized-config-rules.spec.ts` walks the registrations and fails on a path-bearing view whose own module, or the ones it imports directly, make no such call — one hop, so a folder registration's barrel counts and a module deeper in the graph does not.

**Dropping the `path` is not the alternative.** `isPathMatchingRoute` returns false for a pathless view, and `getRouteData` then routes it only by matching its key against Payload's own `oneSegmentViews` — which is why `loginPlugin`'s pathless `login` view works and why a pathless `analytics` would be reachable at no URL at all. A view with a name of its own needs a path, and therefore needs the guard.

### A collection's own edit view is the opposite case

⚠ **`isCustomAdminView` reads the root `admin.components.views` map alone**, so a `path` under a collection's `admin.components.views.edit` never matches it and `Root` applies its `canAccessAdmin` redirect as usual. `getDocumentView` then throws `not-found` unless the caller holds `read` on the document. Such a view therefore needs no `requireAdminAccess`, and `sanitized-config-rules.spec.ts` does not ask it for one.

What it owes instead is **whatever is narrower than admin access**, because nothing upstream knows about it. An event's Registrations view (`src/components/admin/EventRegistrations/`) admits the event's own `manager`, while their account is active, and an admin — narrower than `events` `read`, which is project-wide, and than `events` `update`, which a whole region subtree holds. It calls `redirectRefused` from the same module, which is `requireAdminAccess`'s redirect without its `canAccessAdmin` test.

Two mechanics bound what such a gate can be:

- **A `tab.condition` is handed no document** — only `req`, `permissions` and the configs (`DocumentTabCondition`) — so a per-document decision cannot hide the tab. The tab shows; the view refuses.
- **The route is reachable with no document.** `/admin/collections/<slug>/create/<path>` resolves to the custom view with `docID` of `'create'`, and `ShouldRenderTabs` hides the tabs on the create screen but not the URL. Answer it the same way as a refusal rather than letting a read throw.

## Performance — direct Payload access

A server component has direct DB access via `getPayload()`. Don't fetch internal data over HTTP from a client component. Reserve `fetch()` for external APIs.

⚠ **When a client component calls an `/api/*` path whose gate is per-locale, it sends `useLocale().code`.** A request naming no locale resolves to the default locale, and role gates are per-locale — so a manager with no English roles is denied (#701). Not every hand-rolled fetch qualifies: `docs/rules/access.md`, "What a check with no locale means", names the condition and lists the call sites on each side of it.

## Component organization

Group a component family (main plus sub-components) in a folder with a barrel. Keep a standalone component as a single file. A barrel export **must include a default export** — Payload imports by name.

A module several components share, rather than one a collection registers, goes in `admin/helpers/`. The root of `admin/` is for what Payload mounts.

**What a URL-driven view takes from there**, rather than restating: `useSetQuery<Q>()` patches the query and pushes, typed by the view's own query shape; `firstParam` / `pageParam` (`helpers/searchParams.ts`) read one back, taking the first value of a key Next handed over as an array. `helpers/listControls.tsx` holds the two controls such a view composes, each writing its key to the URL: `QueryPager` — Payload's `Pagination`, plus `PerPage` when given `limits` — and `FilterTabs`. Payload's composed equivalents — `DefaultListViewTabs`, `PageControls` — are bound to a collection's list view (the first hard-wired to All, Folders and Trash, the second `@internal` and reading `ListQuery` state), so neither fits a view of its own. `FilterTabs` is instead Payload's **document-tab markup** — a `buttonStyle="tab"` `Button` carrying the `doc-tab` classes, disabled while selected, with a `pill-version-count` per filter — so the Registrations view's filters and the dashboard's read as the header's Edit / Versions row, counts included. A filter with no rows is left out, unless the URL already selected it, and the row is left out altogether when Accepted is all that remains — the tab's own pill already carries that count; and an event with no registrations at all replaces the whole tab with a notice listing the open items of its Recommendations panel — read from the virtual `qualityReport` with no `select`, and only on that branch, since the report costs a full document read.

**A document tab's count is a `tab.Pill`** — a server component rendered beside the label, as the Versions tab's is. It is handed `req` but no document id, so it reads the id `Root` resolved from `req.routeParams`, and Payload's own `pill-version-count` class makes the two pills match in every tab state. The Registrations tab's pill (`EventRegistrations/RegistrationsPill.tsx`) counts **accepted** registrations — pending ones are not confirmed yet — behind the same gate as its view, which also serves the accepted rows as a CSV (`GET /api/events/:id/registrations/csv`, admin-panel only, so not in the OpenAPI spec).

## A server field component owes its own read gate (#1126)

⚠ **A field component renders on the document route and is reachable on any `form-state` request, and that request names its own row.** `handleServerFunctions` overwrites only `req`, `user`, `permissions`, `locale` and `cookies`; `id`, `collectionSlug` and `data` stay the browser's. `buildFormState` then gates on `canAccessAdmin({ req })` alone — no document access at all — and `managers` leaves `access.admin` unwritten (`docs/rules/access.md`), so that reduces to "is a manager". A `ui` field is exempt from the field-permission check above it as well, and a crafted request that omits `formState` renders the component anyway — so the gate is not optional.

So a server field component that reads the database from the form's `id` — or from any other value in `data` — answers for whatever row the caller names, one request per id. `InstallSummary` handed any manager another service's embed address, region and install progress that way, and `ImportResultsField` resolved caller-chosen event ids with `overrideAccess: true`, populating each manager's name and email.

Two rules, and a component usually wants both:

- **Re-read the row with the caller's own `req` and `overrideAccess: false` before reading anything else, and render nothing when that refuses.** `readAsRequestUser` (`src/components/admin/helpers/readAsRequestUser.ts`) is that read, under one name a walking spec can key on. Put the gate in the shared loader where one exists — `loadInstallRecord` gates for the banner and the summary at once, so the next caller inherits it — then do the `overrideAccess: true` read past it, both inside one React `cache`. `select` the narrowest column for the gate: its value is unused.
- **Take the values from the stored row, never from `data`.** `ManagerContacts` and `ImportResultsField` both do. A column that is `admin.readOnly` with `access.update: () => false` can never legitimately differ, so reading it back costs nothing.

A component whose data genuinely needs no gate says so in a comment: `SubmissionSummary` resolves each link under the viewer's own access, and `SubmissionData`'s `formLabels` records that `forms` is `read: () => true` for everyone, so gating it would refuse nobody.

**A central `form-state` wrapper is deliberately not the rule**: `form-state` is one of six base handlers taking a caller-chosen `id`, so it would read as complete while covering a sixth of the surface.

Find the shape with `grep -rn "data as { id" src/components/admin/`, and the candidates with a sweep for a server component (no `'use client'`) that reaches `payload.find*`. ⚠ That sweep lists the whole population but answers nothing — it listed `SubmissionData` while #1126 was being fixed and the component was read past anyway. Open every file it names.

## Custom field components

- **Destructure typed props**: `const { name, label, localized, options: fieldOptions, admin: { description } = {} } = field as SelectFieldClient`.
- **`useField`**: path is inferred from `FieldPathContext` for a simple field — don't pass it. **Exception**: an `ArrayFieldClientComponent` must pass `path` from props, so the hook tracks the current path during row reordering.
- **`Option` is `string | OptionObject`** — normalize with a small map. A string becomes `{ label: opt, value: opt }`. An object's `label` falls back to its `value`.
- **A `StaticLabel` may be a string or a locale map** — for an aria-label, read the string directly, or `label['en'] || Object.values(label)[0] || name`.
- **Markup**: wrap in `<FieldLabel>` / a `field-type__wrap` div holding `<FieldError>` and your input / `<FieldDescription>`. Base class `field-type` (not `field`), plus a type class (`select`, `text`) and state classes (`error`, `read-only`). Use Payload's `FieldLabel`/`FieldError`/`FieldDescription` rather than rolling your own, and match the markup of Payload's built-in fields.
- ⚠ **Put `mergeFieldStyles(field.admin)` on the root div** (`src/components/admin/helpers/mergeFieldStyles.ts`). Payload merges `admin.style` and `admin.width` for a built-in field and does not export the function that does it, so a custom field that skips this is content-width while its siblings flex — and nothing in the field's own config says so. It stays invisible until someone sets a width, which is how `RolesField` shipped without it. One helper, not a copy per component.

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
