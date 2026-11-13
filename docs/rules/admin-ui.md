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

⚠ **`ProgressBar` is exported, and it reads as though it should show a job's count.** It is the route-transition bar: it takes no props and reads its value from `RouteTransitionProvider`, so it cannot show a job's own count. A job's count belongs in `JobStageView`'s banner instead (below), which is where both consumers put it. A determinate bar is `Progress` (`src/components/admin/Progress/`), the one this repo draws — the Install tab's and launch readiness's: a rounded track and fill drawn as divs, since each browser paints a native `<progress>` its own way, carrying `role="progressbar"` and its `aria-value*` so assistive technology still reads the value. A total of nothing draws an empty bar.

**A notice is `InfoBanner`** (`src/components/admin/InfoBanner/`): Payload's `Banner` with an icon, a title and a sentence or two. **Its one control is its typed `action`**, drawn as a small secondary `Button` after the text — `{ label, href }` for a link, which a server component can pass, or `{ label, onClick, disabled? }` for a handler. It takes no `ReactNode`, so a banner's control cannot be styled one way here and another there; never put a button or link in a banner's children, or beside it.

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

That combination is often what you want — reachable where it's explained, absent from the sidebar. An admin opens a registration this way, through the join on an event's Registration tab rather than the collection's own list. A 404 on the route is not evidence a field needs surfacing elsewhere — try the surfaces that already embed the document first.

⚠ **A join is not a way around the related collection's access.** `user-submissions` is restricted and no manager role reads it, so that join renders empty for every manager however the field is configured, and `admin.condition` hides the field without stopping its subquery. A manager reads their own event's signups on the Registrations **view** instead — a document view of its own, below (#1069).

### `WorkflowButtons` — stage-dependent document buttons as data

`src/components/admin/WorkflowButtons/` replaces a bespoke button component per staged collection. A collection declares its buttons through `clientProps` on an edit-view slot:

```ts
admin.components.edit.SaveButton = {
  path: WORKFLOW_BUTTONS,
  clientProps: {
    statusField: 'status', // the form field whose value picks the stage
    fallback: null, // 'publish' | 'save' | 'saveDraft' | null
    rules: [
      // Precedence order. `when` is optional; omitted, the rule applies to every document.
      { when: { userType: 'admin' }, stages: SPAM_STAGES },
      { when: { field: 'type', equals: 'proposal' }, stages: REVIEW_STAGES },
    ],
  } satisfies WorkflowButtonsProps<MyStage>,
}
```

Each action is `{ label, overrides, confirm?, buttonStyle?, skipValidation? }`; `overrides` is merged into the submit, so `{ status: 'committing' }` is how a button makes a transition and `{}` is a plain save. Six rules:

- **`clientProps`, not `admin.custom`.** An edit-view slot is not a field, so there is no `field.admin.custom` to read, and `createClientCollectionConfig` strips a collection's top-level `custom`. `renderDocumentSlots` passes a `RawPayloadComponent`'s own `clientProps` through — which is why each declaration is an object rather than a path string.
- **An empty stage array is not a missing one.** `[]` renders nothing; a stage the declaration never names falls through to `fallback`. Collapsing the two put Publish back on Meditations' create screen.
- **An unsaved document is `CREATE_STAGE`, whatever the status field holds.** A collection that defaults `status` to a running stage would otherwise hand the create form that stage's buttons.
- **The contract lives in `stages.ts`, not beside the component.** Every export of a `'use client'` module reaches a server module as a client reference, so a config reading `CREATE_STAGE` off the component would key its map on an object. Same split as `UserSubmissions/statuses.ts`.
- **A slot serving several kinds of document decides over (kind, viewer, stage), so it declares an ordered `rules` list.** The first rule that both applies and names the document's stage wins; a rule that applies but is silent about the stage falls through to the next, so an earlier rule narrows rather than claims. `user-submissions` holds four intakes sharing one status vocabulary, so a `contact` row at `pending` resolves the same stage as a proposal awaiting review — and ungated would be offered Accept and Reject. A stage no applying rule names reaches `fallback`; a stage declared `[]` **is** named, so it wins and renders nothing, which is what keeps "no action here" from reading as "not my kind of document" and restoring the Save button.
- **A rule offering a privileged move must name the viewer.** `when.userType: 'admin'` is read from `useAuth()`, and it exists because a button the server will refuse is a control that can only answer 403 (`docs/rules/access.md`). Settling a spam refusal is an admin's move on every intake (`SUBMISSION_MACHINE`), and `managerSubmissionScope` does admit a region manager to a refused contact row addressed to them — so that rule is gated on both sides of the wire. `user-submissions-review-lifecycle.int.spec.ts` asserts the coupling by judging every ungated rule's buttons against the machine as a non-admin reviewer who holds the grant.

**A button is an offer, never a permission, so the server owes its own guard.** `admin.readOnly` on a status column is the admin UI alone, and a field access rule that admits managers admits every manager's `PATCH`. `user-submissions` pairs its declaration with `SUBMISSION_MACHINE`, whose guard rides on the `status` column (which moves a reviewer may make) and whose matched move's name `applyReviewDecision` acts on (what each one then does) — see `src/plugins/formBuilder/AGENTS.md`. Build each rule's `stages` map from whatever the server's own rule reads, rather than listing the statuses again: a hand-written map can offer a button the guard then refuses. `stagesFor(statuses, buttons)` in `stages.ts` is that spread — `{ ...stagesFor(OPEN_REVIEW_STATUSES, REVIEW_BUTTONS), accepted: [] }` — and `when` is how the same discipline reaches the half a status set cannot express, the viewer.

**That guard is the state machine's, and the column carries it** (#1121). A lifecycle is declared once with `defineStateMachine` (`src/lib/stateMachine/machine.ts`) — its states, where a row may open, every `(from, to, by)` move, a move's optional `when` condition, `name` and `refusal`, who may name themselves as a writer, and how a request's person resolves — and the column is `stateMachineField(machine, …)` (`src/fields/stateMachineField.ts`), which derives the options and its `defaultValue` from the machine's own `opensAt`, and mounts the guard as a field `beforeChange`, after every collection hook. `user-submissions` and `events` are its two consumers; the domain facts — who reviews, which intake has a review path, the region an accept needs — are rows and conditions in the owner's own table, never a second predicate beside it. Meditations' buttons post `{ _status: 'draft' }` — Payload's own gate — so they need neither.

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

Declared today in `translationsSchema.json` (a `preview` key beside `screenshot`, read on top-level groups only) and on the Meditations frame and Transcript tabs, which declare `autoOpen` with no path. `user-submissions` declares a conditioned pair: `autoOpen` for a proposal and `autoClose` for every other intake, because Payload keeps one open/closed preference per collection and a panel left open on a proposal would otherwise greet the next contact message.

## Styling — PayloadCMS CSS variables

**Always use PayloadCMS CSS variables** for theme compatibility. A hardcoded color or pixel size breaks the elevation scale.

Full reference: `node_modules/@payloadcms/ui/dist/scss/app.scss`

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

## Import map generation

After registering a component in `payload.config.ts` (`admin.components`), run `pnpm generate:importmap`. Every registered component needs a default export. Path aliases (`@/`) work via tsconfig. The generated file (`src/app/(payload)/admin/importMap.js`, from `admin.importMap.baseDir` in `src/payload.config.ts`) is auto-managed — never hand-edit it. `tests/unit/sanitized-config-rules.spec.ts` compares it byte for byte against what the generator writes for the sanitized config, so a skipped regeneration and a stale entry both fail the unit lane.

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

## Closing the Edit view while a job owns a document — `JobStageView`

A collection whose rows a background job writes needs editing closed while the job runs, or the admin form posts a whole stale document over the worker's writes. `JobStageView` (`src/components/admin/JobStageView/`) is that view, generic over the collection.

`runningStages` is required; `statusField` (default `status`), `progressField` and `totalField` are dotted paths, so a count kept inside a group is reachable. `staleAfterMs` is how long a running stage may stand against `updatedAt` before the form opens anyway — declare one wherever a run can be lost to a restart, since nothing expires a stage and the gate is otherwise permanent. Declare `totalField` wherever the job knows its denominator — the banner reads "7 of 20 done" with one and "7 done so far" without. Declare with `satisfies JobStageConfig` — `admin.custom` is `Record<string, any>`, so that is the only thing that makes a misspelled key a build error rather than a view that never fires.

Four things are load-bearing:

- **`views.edit.default.Component` replaces `DefaultEditView`; it does not wrap it.** So a settled stage falls through by rendering `DefaultEditView` itself.
- **The stored stage at page load is the whole input.** There is no poll, so nothing re-requests the document. **Check again**, the action on its notice (`WaitingNotice.tsx`, the folder's one client component), calls `router.refresh()`, which refetches the route's server render and bypasses the client router cache a `next/link` navigation can be answered from. That is Payload's own idiom — `useRouteCache`'s `clearRouteCache` is the same call. ⚠ Inside a document drawer nothing re-reads the stage: `DocumentDrawerContent` renders the document through the `renderDocument` server function and keeps the result in React state, which no route refresh re-runs. An anchor would re-read it only by leaving the host document and discarding its unsaved edits, so the refresh stands in both surfaces.
- **The gate releases itself only where `staleAfterMs` is declared.** Without one, a row whose worker died stays behind the waiting view for good; past the window the form opens. Setting the status column back to its queued value is the retry **only where someone may write it** — `imports` closes `status` to every writer, so past the window its page opens with no retry on it. What settles such a row is the hourly stale-job sweep, which cancels the job and then marks the import failed (`@/jobs/RecoverLostJobs/RecoverLostJobs`). Check which of the two a collection has before you rely on the window alone.
- **Never name a running stage that is also the column's `defaultValue`** — unless the create genuinely queues the job. `transcripts` declares `processing` and not `queued`, because a queued row waits for a person. `imports` declares its own default `pending`, because its create hook queues the import job, so a saved row at that default really is one a worker owns. Either way the release is `staleAfterMs`: without it, a saved row at that default opens behind a view nothing can move on. The view refuses to fire with no document id, which covers the create form alone.
- **A stage with no form has no `SaveButton` slot either.** The view replaces the whole form, so a `WorkflowButtons` stage declared for a running status is reachable only past `staleAfterMs`.

**`tests/unit/sanitized-config-rules.spec.ts` holds the declaration's wiring.** Every `jobStage` a collection declares has to parse, and every collection registering `JobStageView` has to declare one — which is what answers for a collection that left `satisfies JobStageConfig` off and misspelled a key.

`imports` — the bulk class import's upload collection (`src/plugins/eventImport/importCollection.ts`) — declares `runningStages: ['pending']` with no count. Its job leaves `pending` in one write, with the results (`src/plugins/eventImport/finish.ts`), so the page never opens on a finished import whose rows are not stored yet. After that, a hook on `events` finishes it once the last of its drafts is published or deleted.

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

The Managers `currentProject` field stores the selection. `ProjectSelector` (`beforeNavLinks`) saves a change through `useSwitchProject` (`ProjectSelector/useSwitchProject.ts`), which then re-renders the route with `router.refresh()` — every `admin.hidden` function runs server-side off `user.currentProject` and holds no client state — and moves to `/admin` only when the open collection is hidden in the new project (`shouldRedirectToAdmin`). `ProjectContext` (wrapped in `AdminProvider`) exposes `useProject()` and syncs with the user profile via `useAuth`.

**Which projects a manager may work in, and which one they are in, has one owner:** `getManagerProjects` and `resolveProject` (`src/plugins/access/config/currentProject.ts`), read by the browser and the server alike. A manager reaches their stored roles' projects, plus the projects of the roles their listings derive — Sahaj Atlas once a region or an event names them, read off the `managedRegions` / `managedEvents` joins that both `req.user` and `/me` carry (`docs/rules/access.md`). A stored project they can no longer reach is not honoured. **A manager with exactly one reachable project always works in it**, on every admin page: the server already renders that project's dashboard, and `ProjectProvider` saves it through `useSwitchProject` so the nav and sidebar follow. A failed save is reported in a toast and retried on the next navigation.

**Atlas sidebar.** `admin.components.Nav` is overridden by `AtlasNav`, a server component. When `isManager(user, 'sahaj-atlas')` holds (`src/plugins/access/adminOnly.ts`: a `managers` user of `type: 'manager'` whom `resolveProject` places in `sahaj-atlas`), it renders a purpose-built `AtlasSidebar`. `type` is load-bearing there — an admin must keep `DefaultNav` — and the predicate tests no role, so it is not a check for either Atlas role. The access layer uses the same predicate, without a project, for its non-admin manager branches. Everyone else falls through to Payload's `DefaultNav`. It reproduces the slide-in chrome from exported primitives (`NavWrapper`/`NavHamburger` are internal to `@payloadcms/next`), reuses `ProjectSelector`/`AdminNavLinks`/`Logout`, and adds two panels: the manager's own events, bucketed by stage and collapsible past 8, and the owned-region subtree as an indented, expandable tree with a published/total count pill per node. Data comes from a server-only fetch wrapped in `unstable_cache`, keyed by manager and locale, invalidated by `revalidateAtlasSidebar()` from the Events/Regions change hooks — a server component with direct Payload access, per this file's own rule above.

**The dashboard is one custom view per project.** `admin.components.views.dashboard` is `DashboardView` (`src/components/admin/Dashboard/`), in place of Payload's widget grid — a project's home is composed here rather than registered as a widget, which a saved layout could drop or carry into another project. `dashboardChoiceFor`, beside the view in `DashboardView.tsx`, owns the branch and follows `resolveProject`. A project with no home of its own renders a `CenteredNotice` (`src/components/admin/CenteredNotice/`) in the view itself, so no project list is spelled out there. `currentProject: null` is the admin "All Content" view (`Managers.ts`) and keeps Payload's `CollectionCards`; a manager who has chosen no project gets `ProjectSelectionPrompt`, which the view renders rather than `beforeDashboard`.

**Sahaj Atlas has three homes, one per role, and the widest role wins** (#1070). `managerRoles` (`src/lib/notifications/managerRoles.ts`) reads them off the same `managedRegions` / `managedEvents` joins `virtualRoles` reads, so a home and the grants behind it cannot disagree: an admin gets `AtlasAdmin`, a manager listed on a region gets `AtlasRegion`, and a manager named only on events gets `AtlasManager`. A region manager who also runs a class of their own still gets the region home — it carries their events under its "Your events" filter, where the program home carries nothing of the region. `?region=<id>` renders `AtlasRegion` scoped to one region: an admin may open any, and a region manager outside their own subtree gets the refusal rather than the home, decided before anything is read.

**Each dashboard is one folder of the same shape**: `index.tsx`, a server component that loads and renders, and `data.ts`, its loader, which the integration specs call directly. The client parts — anything reading the URL or handling a click — live in `shared/`, beside what all three compose: `HomeHeader`, `StatTiles`, `OpenItemsList`, `RegionOverviewTable`, `SectionTabs` (progress meter included), the URL-state model, `loadHomeBase` (the open items and tiles every home loads) and one stylesheet. `SetStepNav` needs no client view: a server component renders it like any client component.

**All three open on the same list, and `src/lib/atlasOverview/` is where it comes from.** Every word a reader sees about an open item lives in that folder's `status.ts` — the pill, the line under it, the rank that places the row, the filter it falls under, whether it counts against progress, and the next step. Three homes and the nightly digest read it, so a status spelled at each surface would be four chances to call one state four things. The loaders take `{ scope, req, overrideAccess }`: a page passes `false`, so the list is exactly what the reader's own access admits, and the digest job passes `true` with an explicit scope and no user.

⚠ **A `'use client'` component imports only `atlasOverview/filters`**, the folder's one leaf with no runtime imports; the loaders reach `@/lib/env/server`. `tests/unit/client-bundle-safety.spec.ts` walks the real graph and is what holds it.

**Admin home** (`Dashboard/AtlasAdmin/`): verification health tiles with their 30-day change, then only the work nobody below them covers — a listing at `escalated` or later with no region manager anywhere up its chain, an unadopted listing in such a region, a proposal whose delivery fell through to `CONTACT_EMAIL`, and a sign-up the spam check refused. A region with a manager above it is that manager's work, and the previous home's "Needs attention" row asked an admin to do everyone's. There is **no meter** here: progress is a share of somebody's own workload, and this list is what fell through everyone else's. The Countries overview counts countries, not regions, for the same reason the escalation ladder does.

**Region home** (`Dashboard/AtlasRegion/`): the subtree's open items, plus a Regions overview. **Program home** (`Dashboard/AtlasManager/`): the events they manage, with analytics for the last 30 days.

**A tile's change line has two sources, and neither is optional.** A stage count has no history on the event — the stage is overwritten in place — so its change comes from the daily snapshot the nightly `recordAtlasSnapshot` task writes to `payload.kv`. A sign-up count is a dated row, so its change is two queries over `createdAt`. ⚠ **With no snapshot 30 days old a tile shows no change line at all**, never "+0": a freshly deployed environment knows nothing about 30 days ago.

**Every next step is a link to an edit view that already exists.** No endpoint, action or hook is added for any of them: Verify works because a manager's republish re-verifies (`Events/hooks/syncVerificationOnSave.ts`) and the event page's own banner already asks for it. The filter row is `FilterTabs`, and the section tabs are links carrying `tabs-field__tab-button`, keeping the rest of the query (`?region=` above all) — `TabComponent` itself renders `WatchChildErrors` and needs a `Form`, which a dashboard does not have. All three homes link to the public map through `NAV_LINKS.map` (`AdminNavLinks/links.ts`), the constant the sidebar's links render from, so the sidebar link and the buttons cannot give one destination two names.

## Project visibility (collection sidebar filtering)

`accessPlugin` auto-generates `admin.hidden` for every collection and global. **Never hand-write project visibility — let the plugin do it.** A collection may still hand-write `admin.hidden`, and the plugin composes it (`accessPlugin.ts`): `true` hides the collection outright (`Songs`, `Transcripts`), and a function is asked first, with project visibility applied only when it returns false. ⚠ Reach for neither where the role table already answers: `users` grants a write to no role and sits in no project, so deleting its `hidden` key left the derivation admitting admins alone — and admitting a role granted `users: ['update']` later, which a hand-written `isAdminManager` predicate would have refused (#630). A global's own `admin.hidden` is overwritten.

A role with no write grant on a collection can still be given its admin pages by declaring `virtual: { opens: '<slug>' }`, for a listing whose documents reach the manager through document-level access (`docs/rules/access.md`).

Project assignments live in the internal `PROJECTS` constant (`src/plugins/access/config/projects.ts`). Add a collection to a project by editing its `collections:` array there. Lookup tables recompute automatically.

Page, video, and image tags are inline enum selects, not separate collections.

## Frame editor

`src/components/admin/FrameEditor/` manages audio-synced frames on the Meditations collection, integrated with Live Preview. `FrameListManager` (edit/reorder/remove) and `FrameInserter` (browse/insert at the current playback time) sit under a Video tab's Manage/Insert sub-tabs. Both tabs declare `autoOpen` through `previewTargetField`, which replaced a `useLivePreviewAuto` mount effect. A `PLAYBACK_TIME_UPDATE` postMessage from the iframe drives the active-frame highlight — **accepted from the preview iframe's origin only**, because that playhead is the timestamp a newly inserted frame is written at. Each subscription names the origin it will hear from (`usePlaybackTime`, reading `iframeRef`), so the permission belongs to a mounted component instead of to a flag someone has to clear; with no iframe there is no subscription. The same `iframeRef` carries `SEEK_TO_TIME` back. Both hooks and the store behind them are `helpers/livePreviewPlayback.ts` and `helpers/playbackTimeStore.ts` — the transcript panel reads the same playhead. Inserting at an occupied timestamp replaces rather than throws.

Frames filter by narrator gender automatically, with category pills for the visible library. Two layers gate frames, and only one of them errors. On Meditations the `frames` validator returns `'At least one frame is required'`, on update only and never on create — which is what refuses a publish with no frames. Its `beforeChange` hook silently drops any entry with no id or a negative or non-finite timestamp, then sorts the rest; `afterRead` rounds each timestamp and enriches it with its Frame collection details. Duplicate timestamps are allowed here, as is one frame at several times — whole numbers, no duplicates and the one-hour cap are `validateTimestamp`'s rules in the editor alone.

Tests: `tests/int/meditationFrames.int.spec.ts` (validation, sorting, enrichment, publish rules), `tests/int/frames-by-narrator.int.spec.ts` (the `framesByNarrator` auth gate, gender-matched results, sort order).
