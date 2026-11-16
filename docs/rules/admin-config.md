---
paths:
  - src/globals/**/*.ts
  - src/collections/**/*.ts
  - src/fields/**/*.ts
  - src/lib/richEditor/blocks/**/*.ts
---

# Admin config

What the admin settings on a collection, global or field config owe: which data a condition reads, live preview, project visibility, and registering a component. Writing the component itself is `docs/rules/admin-ui.md`. A component a config declares carries its contract beside it:

- `WorkflowButtons`, a staged collection's document buttons — `src/components/admin/WorkflowButtons/AGENTS.md`
- `JobStageView`, closing the Edit view while a job owns a row — `src/components/admin/JobStageView/AGENTS.md`
- A custom view declaring a `path`, which owes its own auth gate — `docs/rules/admin-ui.md`

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

**`unavailable` is the one target that may change the origin.** It names a
`LivePreviewUnavailableReason` — the same codes a `livePreview.url` passes to
`livePreviewUnavailableUrl` — rather than a URL, so it carries no origin and no credential and
resolves against the admin's own. Everything else still goes through `composeTargetUrl`, which
refuses a cross-origin path. ⚠ A collection whose `livePreview.url` reads `data` (`clients`)
re-resolves it on every save, so `PreviewTarget` re-applies its target whenever the resolved URL
changes under it.

Declared today in `translationsSchema.json` (a `preview` key beside `screenshot`, read on top-level groups only) and on the Meditations frame and Transcript tabs, which declare `autoOpen` with no path. `user-submissions` declares a conditioned pair: `autoOpen` for a proposal and `autoClose` for every other intake, because Payload keeps one open/closed preference per collection and a panel left open on a proposal would otherwise greet the next contact message.

## A hidden collection is still reachable through a `join`

`admin.hidden: true` removes a collection from the nav **and** unregisters its routes — `/admin/collections/<slug>/<id>` 404s. It does not make the documents unreachable: a `join` field on another collection still renders its rows and opens each in a document drawer, which never touches the route. Nested drawers work from there too.

That combination is often what you want — reachable where it's explained, absent from the sidebar. An admin opens a registration this way, through the join on an event's Registration tab rather than the collection's own list. A 404 on the route is not evidence a field needs surfacing elsewhere — try the surfaces that already embed the document first.

⚠ **A join is not a way around the related collection's access.** `user-submissions` is restricted and no manager role reads it, so that join renders empty for every manager however the field is configured, and `admin.condition` hides the field without stopping its subquery. A manager reads their own event's signups on the Registrations **view** instead — a document view of its own, in `docs/rules/admin-ui.md` (#1069).

## Project visibility (collection sidebar filtering)

`accessPlugin` auto-generates `admin.hidden` for every collection and global. **Never hand-write project visibility — let the plugin do it.** A collection may still hand-write `admin.hidden`, and the plugin composes it (`accessPlugin.ts`): `true` hides the collection outright (`Songs`, `Transcripts`), and a function is asked first, with project visibility applied only when it returns false. ⚠ Reach for neither where the role table already answers: `users` grants a write to no role and sits in no project, so deleting its `hidden` key left the derivation admitting admins alone — and admitting a role granted `users: ['update']` later, which a hand-written `isAdminManager` predicate would have refused (#630). A global's own `admin.hidden` is overwritten.

A role with no write grant on a collection can still be given its admin pages by declaring `virtual: { opens: '<slug>' }`, for a listing whose documents reach the manager through document-level access (`docs/rules/access.md`).

Project assignments live in the internal `PROJECTS` constant (`src/plugins/access/config/projects.ts`). Add a collection to a project by editing its `collections:` array there. Lookup tables recompute automatically.

Page, video, and image tags are inline enum selects, not separate collections.

## Import map generation

After registering a component in `payload.config.ts` (`admin.components`), run `pnpm generate:importmap`. Every registered component needs a default export. Path aliases (`@/`) work via tsconfig. The generated file (`src/app/(payload)/admin/importMap.js`, from `admin.importMap.baseDir` in `src/payload.config.ts`) is auto-managed — never hand-edit it. `tests/unit/sanitized-config-rules.spec.ts` compares it byte for byte against what the generator writes for the sanitized config, so a skipped regeneration and a stale entry both fail the unit lane.
