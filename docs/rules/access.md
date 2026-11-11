---
paths:
  - src/plugins/access/**/*.ts
  - src/collections/Clients/**/*.ts
  - src/collections/Managers/**/*.ts
---

# Role-Based Access Control

The `accessPlugin` gives every collection access control automatically. A collection needs no manual `access` config. The plugin also sets `admin.hidden` for project visibility and field-level access for localized fields.

## Manager roles

The Manager `type` field controls top-level access: `inactive` (denied), `manager` (uses `roles` plus document-level manager access, below), `admin` (full bypass — the admin UI hides `roles`).

Manager roles are **per-locale**: a manager can hold `meditations-editor` in English and `web-translator` in Czech, and gets the matching access in each admin locale.

### Roles nobody assigns (#1068)

`atlas-region-manager`, `atlas-event-manager` and `page-editor` declare `virtual: { join: 'managedRegions' }`, `virtual: { join: 'managedEvents' }` and `virtual: { join: 'managedPages' }` in `ROLES`. Nothing stores them: `virtualRoles(user)` resolves them on every request from those joins `Managers` declares, and `extractRoles` appends them to the stored set. Being listed on a page or a region, or named on an event, **is** the role — so there is nothing to keep in step, and removing the listing withdraws the grant on that manager's next request.

This is why they replaced a stored `atlas-manager`: who manages a region was already a fact of the listing beside it, and a second record of the same fact could disagree with it. A program manager held no role at all.

- **`getRoleOptions` refuses one**, at config build, so no select can offer a value nothing reads and nothing removes. `getRoleLabel` is what the admin UI names a held one with: `RolesField` shows it in the `roles` select as a chip with no remove button, and ⚠ `storedRoles` strips every derived chip from each change, which is the guarantee — Backspace and the clear button remove a chip whatever the button shows.
- ⚠ **A derived role is held in every configured locale, and in no other scope.** The listing is not localized, so the grant applies wherever the scope resolves — but `?locale=all`, and any locale outside `LOCALES`, still resolve nothing, which is what #665 left the `undefined` scope meaning. `'union'` does resolve, because that is admin-UI nav visibility. ⚠ **The admin locale selector deliberately does not follow.** `filterAvailableLocales` offers a manager whose only role is derived English alone, because nothing either Atlas role grants carries a localized field — `regions` and `events` declare none, and an event's `title` is one non-localized value — so a second language would open no content the first does not. A localized field on either collection makes that answer wrong, which is why `role-based-access.int.spec.ts` reads it off the booted config. `page-editor` lands on English too, though `pages` is localized — a deliberate choice, not the same argument: a page assignment names no language, so another one comes from a stored role.

`atlas-service-manager` (#1055) declares `virtual: { join: 'managedClients', opens: 'clients' }`, the inverse of `Clients.managers`, and holds no grant at all: `clients` is restricted, and a manager's own services already reach them through document-level access. The role adds the `sahaj-atlas` project and the "Your websites" digest (`managerRoles`). ⚠ **`opens` is what lets them open a service at all.** `createHidden` hides a collection from a role with no write grant there, and Payload answers a hidden collection's document route with a 404, so without it the Install tab is closed to the managers it is for. It decides visibility only: the row's own access still decides what they read and write. ⚠ **The join carries a `where`** (`roles contains sahaj-atlas-client`), so a manager listed on an app's key derives nothing — and `readManaged` (`src/plugins/login/grantSummary.ts`) applies the same `where`, so an invitation never names one either. `clients` sits in no project, so an invitation for a service takes its brand from this role (`getJoinProject`).

`page-editor` holds no `pages` grant. A role grant is collection-wide, and the listed pages already reach their editor through document-level access, which is the exact scope; the role adds the `wemeditate-web` project and `images` / `files` create. `Pages.managers` is admin-only on update, which is the lock that keeps anyone else from handing it out.

- ⚠ **And only for a `managers` caller**, spelled as an allowlist. `clients` declares neither join, but `virtualRoles` reads a shape rather than a collection.
- ⚠ **Never ask the joins _which_ regions.** A join carries at most its own `limit` of rows (Payload's default is 10), so `virtualRoles` reads only whether `docs` is non-empty. `resolveOwnedRegionIds` answers "which" from a query, and a truncated join would silently shrink a large country's subtree.
- **A spec's fixture needs a re-read.** A `createManager` result is the create response, so both joins are empty and a region listed afterwards is invisible to it. `testData.authUser` re-reads the manager the way Payload's JWT strategy does (`findByID`, no `joins: false`).

### How a per-locale role reaches `req.user` (#665)

This only works because the authenticated user loads **four times**, not once. `roles` is `localized`, and an ordinary read resolves one locale — Payload's own `local-jwt` strategy passes none, so it reads the default. Left alone, every manager's English roles would apply in all 19 locales, and a manager with no English roles would be locked out entirely.

`src/plugins/access/localizedRolesAuth.ts` re-loads the manager at the auth strategy (every request), `afterLogin`, `afterMe` (the admin's own `/me` call on mount), and `afterRefresh` (a tab left open). Skip any one and that moment's read reverts to the flat, default-locale array.

⚠ **All four are hooks on an auth _response_, so a sign-in that builds its own response gets none of them.** That is why `POST /api/managers/redeem` (#837) **redirects** to `/admin` instead of returning a user: a hand-built body there would carry flat, single-locale `roles` that nothing else in the app hands out. The redirect leaves `afterMe` to resolve them on the admin's next `/me`. Any future route that mints a session itself owes the same choice — return nothing, or run the roles through `withLocalizedRoleAuth`'s shape.

⚠ **Nothing wires this up on the collection**. `accessPlugin` attaches all four hooks to any auth collection whose `roles` field is `localized`. A future such collection is covered automatically. `Clients.roles` is flat, so it is skipped.

⚠ **A manager loaded any other way still carries the flat array.** Fine for editing the document. Wrong for deciding access.

**The admin locale selector follows the same roles** (`filterAvailableLocales`). **English is not force-added** (#665). A manager holding roles only in French sees French alone, and Payload lands them there — the forced English entry used to make their own locale unreachable. The first entry is both the top of the dropdown and the landing locale, so the ordering is a real behavior, not cosmetics.

### What a check with no locale means

`hasPermission`'s `locale` argument is a `RoleScope`. Each value is a deliberate answer:

| Scope          | Meaning                       | Used by                                                                                            |
| -------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| A `LocaleCode` | Roles assigned in that locale | Every ordinary access check                                                                        |
| `'union'`      | Roles in **any** locale       | Admin nav visibility, called with no locale — anything narrower empties the sidebar for non-admins |
| `undefined`    | Nothing resolvable, so deny   | `?locale=all`, and any locale outside `LOCALES`                                                    |

⚠ **A hand-rolled admin `fetch('/api/…')` must send the active admin locale — `useLocale().code` from `@payloadcms/ui` — whenever the endpoint or collection it calls runs a per-locale `hasPermission`.** A request naming no locale resolves to the **default** locale, so the gate reads the manager's English roles and denies anyone whose roles live only elsewhere. Payload's own admin requests and `usePayloadAPI` already send it; a hand-rolled `fetch` does not. Three of them shipped without it, and a French-only manager saw a 403 on the frames library, blank list thumbnails, and a refused Accept (#701). A locale-keyed request cache (an SWR key, a batch key) must include the locale too, or one locale's response answers another's cells.

**The condition is the gate, not the call.** `grep "fetch('/api/"` over `src/components` finds more call sites than this rule governs, so check what the target does before you "fix" one:

| Call site                                                                          | Sends the locale? | Why                                                                                                 |
| ---------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `FrameEditor/utils.ts` → `/api/frames/by-narrator/:id`                             | **Yes**           | The endpoint's permission gate resolves `req.locale`                                                |
| `ThumbnailCell/relationshipDocLoader.ts` → `/api/:collection`                      | **Yes**           | The collection read gate does                                                                       |
| `MeditationTranscript/transcriptModel.ts` → `/api/transcripts`                     | **Yes**           | The collection read gate does, and it is the SWR key, so it must carry the locale twice over        |
| `MeditationTranscript/transcriptModel.ts` → `POST /api/meditations/:id/transcribe` | **Yes**           | The endpoint's permission gate resolves `req.locale`                                                |
| `IntroSubtitles/introSubtitlesModel.ts` → `POST /api/files/:id/subtitles`          | **Yes**           | The gate resolves `req.locale`, **and** that locale is the language the cues are made and stored in |
| `ProjectSelector.tsx`, `ProjectContext.tsx` → `/api/managers/set-project`          | No                | Gated on `requireActiveManager`, then reads with `overrideAccess: true` — no per-locale check runs  |
| `TranslationsRow/useEnglishTranslation.ts` → `?locale=en`                          | Pinned to `en`    | It wants the English **text** for translators, not the caller's roles. Admin-only today             |

Submission review was a **Yes** row of its own until #909 put it on Payload's own document form. `DocumentInfo` builds the form `action` with `qs.stringify({ depth: 0, 'fallback-locale': 'null', locale, … })`, so a review that submits the form carries the locale without anything here arranging it — which is the cheapest way to satisfy this rule: don't hand-roll the call.

**Where the locale is required, build the URL in a pure module and return `null` without one** — `framesByNarratorKey`, `transcriptUrl`, `transcribeUrl`, `introSubtitlesUrl` all do, and `tests/unit/admin-locale-urls.spec.ts` pins each refusal. `useLocale()`'s context default is `{}`, so `code` is `string` to the compiler but can be `undefined` at runtime, and `?locale=undefined` is rewritten to the default locale by `sanitizeLocales` — the #701 403 again, silently. Refusing to build the URL turns that into a visible failure, and makes the call site testable without a browser.

⚠ **Never derive this scope by hand from `req.locale`. Call `roleScopeFromLocale`.** Written out per call site it drifts. Four hand-written copies once existed, and the fourth answered `?locale=all` with `'union'` where the rest denied it. Worse, `req.locale` is a request-supplied string, and `RoleScope` has a non-locale member. A cast lets `?locale=union` name the privileged scope and hand a manager every locale's roles at once. The helper accepts only a configured locale, so `?locale=all` now **denies** instead of leaking the flat array through. The admin UI never sends it. Only a hand-rolled API call can reach this path. Clients are unaffected — `Clients.roles` is not localized.

A custom **endpoint** does not call it directly either: `requireManagerPermission` and `requireCollectionPermission` (`@/lib/endpoints`, `docs/rules/endpoints.md`) own that call, and `tests/unit/endpoint-permission-gate.spec.ts` fails one written out under `src/collections/**` or `src/endpoints/**` (#969). A **hook** has no 403 envelope to return, so it calls `holdsCollectionPermission` (`@/plugins/access`), which both gates read the scope from — one owner, two shapes.

⚠ **A collection's own `update` is wider than its role grants, so never read it to answer "may this user decide".** When the grants deny, `createAccessConfig` falls back to document-level manager access (`accessConfigs.ts`), so whoever a `manager`-shaped field names holds `update` on that row with no grant at all. That is right for editing the row and wrong for a privileged write taken _through_ it: on `user-submissions`, accepting a proposal creates a published Events row with `overrideAccess: true`, so reading the collection's `update` would make being assigned a proposal authority to publish it. `reviewMove` (`src/collections/UserSubmissions/lifecycle/review.ts`) reads the grant, which is what `POST :id/review` gated on before #909 deleted it.

## API client roles

The `-client` suffix disambiguates a client role from a project slug. Client roles are **not localized** — one set of roles applies across every locale. Clients are read-only by default. `wemeditate-web` and `sahaj-atlas` may additionally **create** `user-submissions` — create only, with no update of any kind. The registrant confirm/deny vote that once needed an `update` grant, a uuid-scoped access branch and a field-whitelist hook is written by the CMS-hosted `/registrations/feedback` page with `overrideAccess`, and always was, so all three were removed (#723). API clients see only published documents on draft-enabled collections **and globals**.

⚠ **"and globals" is load-bearing, and was false until it was fixed.** The published-only clause asks `entityHasDrafts` whether the entity carries drafts. That used to resolve the slug through `req.payload.collections[...]` alone — a map a global is not in — so it answered `false` for every global, the clause never fired on one, and an ordinary client API key plus `?draft=true` read unpublished copy out of all three translations globals with no live-preview credential at all. It now checks `req.payload.config.globals` too. `globals-client-reads.int.spec.ts` reproduces the leak and fails if that branch is removed.

## Permission flow

1. Block null users.
2. Run `bypassPermissions`, in the order the code checks them: the admin bypass, then inactive-manager and inactive-client (`Clients.enabled`) blocking, then self-access (read your own document, and update it if you are a manager). Self-access is last, so neither an inactive manager nor a draft client reaches it.
3. Resolve the roles for the request's scope (`extractRoles`). None resolvable → deny.
4. For each role: **(a)** implicit read of what the role's project names — a collection in no project fails closed. **(b)** An O(1) permission-table lookup, where `translate` grants an update on localized fields only.
5. Otherwise deny. `createAccessConfig` then applies document-level manager access — see below — when `hasPermission` denies an active non-admin manager a read or update.

The numbers are the step comments in `permissions.ts`.

A bypass function returns `'allow'`, `'deny'`, or `'continue'`.

## Important behaviors

### Project-based implicit read

Managers and API clients both read their role's project plus every shared collection.

### Document-level manager access

A `managers` (hasMany) or `manager` relationship to `managers` on any collection grants those managers **read and update** on its documents, with no role needed. A self-referential `parent` field lets a document inherit managers from its ancestors, via the nested-docs `breadcrumbs` trail. Fields are found by introspecting `flattenedFields` (`documentManagers.ts`) — no slug is hardcoded. Any collection that adds such a field is covered (today: Pages via "Page Editors", Regions, Clients). Read and update only, never create or delete — and only after the query-free check has failed.

⚠ **On `regions` and `events` the listing is also the role, so writing one is a delegation.** `Regions.managers` and `Events.manager` therefore carry a field-level `access.update` (`regionManagersFieldAccess`, `eventManagerFieldAccess`): an admin, or a region manager whose own subtree holds the row — the row's own id for a region, its `region` for an event. With no row to judge, the capability call `/api/access` makes with no document, the answer is whether the user owns any region at all, as `scopeRegionSubtreeWrite` answers a create. An event assignee is refused, so they can neither pass their event on nor disown it. Payload **strips** a field its `access.update` refuses rather than erroring, so a PATCH naming `manager` succeeds with `manager` unchanged.

`resolveManagedDocIds` — the managed-set resolution both this fallback and the region-subtree scoping below run — is memoized per request, keyed on `(collection, userId)` (#749). Payload evaluates each access operation independently and dedups nothing between them: `getEntityPermissions` fires every operation of a collection in one `Promise.all` with byte-identical args, and its `whereQueryCache` cannot help because that only runs with `fetchData: true`, which `/api/access` does not pass. Measured, one `/api/access` call as an Atlas region manager went from 12 `regions` queries to 2.

**It collapses the list-level resolutions only.** `createAccessConfig`'s single-document `update` branch (`id` present) routes to `userManagesDocument` instead, which is still unmemoized — so a document edit view, where `getDocumentPermissions` repeats the whole operation set four times for a drafts+trash collection, still pays that path per evaluation. The `resolveManagedDocIds` JSDoc owns the two hazards a per-request memo opens: the staleness window it pins, and why it must not be lifted to the access function. Read it before you widen the key.

### Region-subtree write scoping (Atlas managers)

`atlas-region-manager` is the one role granting writes on `regions` (create and update) and the full set on `events` (create, update, delete); `atlas-event-manager` grants `events` update and delete alone — `config/roles.ts`. `regionSubtreeAccess.ts` narrows every such grant to the manager's **owned-region subtree**: the regions listing them in `managers`, plus every descendant via `breadcrumbs`. An event assignee owns no region, so their whole grant narrows to the `manager == user` arm below.

- **regions** — `create` requires the new region's `parent` in the subtree. `update` is scoped to subtree members. There is no `delete` (admin-only, since child regions and events reference it by foreign key).
- **events** — scoped by `region ∈ subtree` **or** `manager == user` (the direct-owner case). `create` requires the incoming `region` in the subtree. Hard `delete` is scoped the same way. Soft-delete (trash) is an `update` to `deletedAt`, already covered.
- **read** stays project-wide — only writes are subtree-scoped.

Wired into `createAccessConfig` on an explicit slug allowlist (`{ regions, events }`), not field introspection, since create/delete are security-sensitive and a stray `managers` field elsewhere must not silently widen access.

⚠ **`ownedRegionFilterOptions` keeps the value a document already holds, and a document that can hold one owes it that `keepCurrent` argument.** `validateFilterOptions` re-runs on every save with no exemption for a value that did not change, so the subtree alone refused two saves a manager is entitled to make: an event assignee owns no region, and a region manager's own top region sits under a parent above their subtree. Both could open the document and neither could save it — which also blocked the re-verification a save performs. Keeping the value is not permission to move it: `keepCurrent` is the value the caller **posted**, and `scopeRegionSubtreeWrite` reads the stored row to refuse a real move at the row level, before any field runs — so the exemption narrows a picker and is never itself a check. A bulk update has no one stored row, so it keeps the strict test.

### Which submissions a manager sees

The `user-submissions` grant both Atlas roles carry is collection-wide, and the collection holds four intakes in one table, so `managerSubmissionScope` (`accessConfigs.ts`) narrows it per row: the contact rows whose form names them as recipient, plus the proposals they are the reviewer of. The two roles differ only over that second clause — a region manager reads the proposals landing in their subtree, an event assignee the ones on their own events, and someone who is both reads the union. Registrations and subscriptions appear for nobody but an admin.

⚠ **The subtree clause has to reach past `region`**, because a proposal for a city the atlas does not hold yet has none: `deliverProposal` mails its state or country manager, who would otherwise be unable to read the row they were asked to review. `routingRegion` — the deepest level intake matched, written once at create — is that reach, and an owned subtree is closed downwards, so matching it answers exactly what `submissionRoutingRegionId`'s `??` chain would. ⚠ **It is an indexed relationship column, and must stay one.** These facts lived in a JSON column until #1068, reachable only by `jsonb_path_exists`, and `createJSONQuery` inlines one OR'd sibling per value — so a country manager owning ~1,000 regions sent ~3,000 unindexable predicates and the read degraded to a seq scan of `user_submissions`.

### Locale-scoped write scoping (per-locale editors, #980)

A meditation **is** one language — its hidden `locale` select — but `meditations-editor` is granted per locale and the grant it carries names none. So the collection-wide grant let a French or Czech editor open an English meditation by its URL and rewrite its label, narrator, thumbnail, type, music tag and frames for every English listener. `scopeLocaleWrite` (`localeScopedWrites.ts`) narrows a non-admin manager's write to the locale `hasPermission` evaluated their role in — the language this request's roles came from, never the language the document claims.

⚠ **A top-level field named `locale` IS the document's own language, and its presence is the whole opt-in.** No collection declares anything, wires a hook, or writes an access rule: `isLocaleScopedCollection` asks `flattenedFields` whether the column is there. ⚠ **Never give it the raw `fields`.** Sanitization splices every container that adds no path of its own — a row, a collapsible, an unnamed tab or group — into the top level, so a raw walk has to reproduce that rule to agree with a query, and reproducing it once missed an unnamed group: the column scoped at the access layer, the collection left without the create hook, and the `duplicate` bypass reopened.

⚠ **So the name is a commitment: never spell a column `locale` unless it is the document's own language.** A column meaning anything else takes a name of its own, or it silently acquires this scope the day its collection takes a write grant — `Clients.language` is a service's preferred language, and `imports.uploadLocale` the admin locale an upload happened in (#912). Both were spelled `locale` and were renamed for exactly that reason. `Lectures.subtitles[].locale` needs no rename: it is a row key inside an array, which no top-level rule reaches either way. Unlike `REGION_SUBTREE_COLLECTIONS` above, there is no list in the code to keep.

A new column would take the scope silently, so the invariant is asserted rather than trusted: `tests/int/role-based-access.int.spec.ts` walks `payload.config.collections` for a queryable top-level `locale` and names every collection carrying one — `meditations` alone today — so a second one reds the suite until someone confirms the column really is a language.

- **update** (and `delete`, which no role grants today) → `{ locale: { equals: <scope> } }`. A single-document update that does not match answers **403 Forbidden**, because `updateByID` reports a `Where` policy that matched nothing as a refusal rather than a 404.
- **create** → a boolean, because `executeAccess` reads a `Where` as a grant and an object there would allow every language. An absent `locale` is allowed: the field pass that fills it has not run yet, and the admin asks this question with no data at all to decide whether to offer the Create button.

⚠ **A create can state its language or have it filled, and only the first is answerable here.** `access.create` runs before the field pass, so an absent `locale` has to pass — and `duplicate` sends an **empty `data`** and then clones the _source document's_ locale rather than taking the default, because `getFallbackValue` prefers `siblingDoc` over `defaultValue`. Unguarded, a French editor could `POST /api/meditations/<english id>/duplicate` and land a new English meditation in the app's English catalogue that only an admin can then edit. `restrictCreateToRequestLocale` — the `beforeValidate` hook `accessPlugin` attaches to every collection, which stands down unless the collection carries the column, so no collection wires one by hand — refuses that, at the first point the language is known. It is the complete rule: a stated `locale` survives the field pass untouched, so the hook sees that one too. The `create` arm above is kept because an access config that scoped `update` and `delete` but not `create` would read as an oversight — it refuses a stated language one layer earlier, and nothing depends on it alone.

- **read** is untouched. `filterMeditationsByLocale` already scopes `find` and `count` and deliberately skips writes; the admin list and every client feed are unchanged.
- **Version history follows on its own.** `withDerivedGrants` derives `readVersions` from `update` and translates the clause onto `version.locale`, so an editor reads the history of their own language's meditations and no other.
- **Narrators are shared.** Every language draws on the same narrators, so `meditations-editor` keeps its unscoped `narrators` grant.

⚠ **A `Where` reaches only the operations Payload itself combines it into, so a custom endpoint owes the comparison.** `POST /api/meditations/:id/transcribe` gates on `meditations: update` and then reads and writes with `overrideAccess`, so nothing here narrows it: the grant this section narrows everywhere else stayed collection-wide at that one door, and a `fr`-only editor could delete an `en` meditation's transcript and buy a new paid run. It calls `isOutsideWritableLocale` — the same predicate the create hook uses — on the row's own `locale`, and the Transcript tab hides the Transcribe-again button on the same condition, because a control that can only answer 403 is what the access layer avoided for Save. **Any future endpoint that reads a locale-scoped collection with `overrideAccess` after a permission gate owes the same call.**

⚠ **"Locale-scoped" means a top-level `locale` column, and most collections have none** — so the rule above does not reach every endpoint that gates then overrides. `POST /api/files/:id/subtitles` (#1016) is the worked counter-example: it gates on `lessons: update` and reads `files` and writes `transcripts` with `overrideAccess`, and none of the three carries that column, so there is no row language to compare. What the request's locale decides there is which language the cues are **made in** and recorded as, and the gate already proved the manager holds that locale. Check for the column before reaching for `isOutsideWritableLocale`: calling it on a collection with no `locale` field compares against `undefined` and narrows nothing, which reads as a guard and is not one.

A bilingual editor is therefore bound to the admin locale they are working in: holding the role in `en` and `fr` edits an English meditation only with the admin in English. Admins are unaffected — the admin bypass answers before any of this.

### Derived grants: one pass, one table (#719, #748)

Two access keys are **derived from `update`** rather than computed from the role tables, because both are edit authority wearing another name: `readVersions` (version history, #719) and `unlock` (clearing a login lockout, #748). `withDerivedGrants(access, keys)` writes them in one pass, and `DERIVED_GRANTS` in `accessConfigs.ts` is the table of what differs between them — today, only whether the `Where` needs translating.

⚠ **`unlock` is now unreachable on both auth collections, and the grant still has to be right.** `managers` sets `disableLocalStrategy` (#840) and `clients` always did, so Payload's `unlock` operation answers `Forbidden` before access control runs, and `maxLoginAttempts: 0` leaves no counter to clear. The derivation is asserted by `tests/unit/access-derived-grants.spec.ts` rather than against a locked account, and it is kept because the failure it guards — Payload refilling an unwritten key with `Boolean(user)` — is a property of every derived key, not of lockouts.

They are one function because they share one failure, one guard, and one hazard. Both shipped by going **unwritten**, both must drop `args.id` before delegating, and both fail closed when there is no `update`. Two copies of that drift: a fix to one is a fix somebody must remember to port.

It wraps the **merged** access config in `accessPlugin.ts`, after `...collection.access` / `...global.access` — **not inside `createAccessConfig`**, which is the obvious-looking home and the wrong one. `createAccessConfig` runs _before_ a collection's own `access` overrides are spread in, so a grant derived there binds to an `update` the override then replaces — silently, and in the permissive direction whenever the override is the narrower function. Deriving from the merged config is what makes "whoever may edit this entity" true of the entity as configured, and it is why a collection that sets its own `readVersions` or `unlock` keeps it.

A global has no `unlock` — its access keys are `read`, `update`, `readVersions` — so the globals call site asks for that one key. Nothing else about the pass differs.

⚠ **Both derivations fail closed when there is no `update` to delegate to.** They write `() => false` rather than returning the config untouched — an _unset_ key is refilled with the permissive `Boolean(user)` (from Payload's collection defaults for `unlock`, from `executeAccess`'s fallback for `readVersions`), which is exactly how #719 and #748 shipped. `createAccessConfig` always assigns `update` and every `access:` under `src/collections` is field-level, so the branch is unreachable through `accessPlugin` today. `tests/unit/access-derived-grants.spec.ts` reaches it directly, so the direction is asserted rather than assumed.

⚠ **`args.id` is dropped before delegating, and must be.** `findVersionByID` calls access with the _version row's_ primary key, not the document's — two independent sequences that happen to overlap. Forwarded to `update`, every id-sensitive branch answers about the wrong document: the self-access bypass hands a manager row `N` of `_managers_v` because their own id is `N`, and `userManagesDocument` grants any row whose number matches a page the caller manages. Dropping it makes `update` answer at the list level, which `findVersionByID` then ANDs with `{ id: { equals: <row> } }` itself. `unlockOperation` passes no `id` at all today; dropping it keeps that true if a future Payload passes one.

### The one key still unwritten: `admin`

A collection's access keys are `create`, `read`, `update`, `delete`, `readVersions`, `unlock`, and **`admin`**. The plugin now writes all but the last, and `admin` does **not** belong in the table above:

- **No client key reaches it.** `canAccessAdmin` reads `access.admin` on `config.admin.user`'s collection alone (`managers`), and `getAccessResults` computes `canAccessAdmin` only for that same collection. A `clients` key is refused by slug before any access function runs.
- **`update` is not its authority.** It answers "may this person open the admin panel", not "may they edit this record". Deriving it from `update` on `managers` would lock every non-admin manager out of the panel entirely, since no role grants `update` there.
- **Its fallback is not the same fallback.** Unset, `canAccessAdmin` grants any user of the admin collection, and `getAccessResults` reports `isLoggedIn`. That is a narrower default than `Boolean(user)` on a public endpoint, and changing it is a UI-access decision, not this fix.

The gap worth naming: an **inactive** manager still loads the admin shell, then finds every collection denied. That is its own ticket, not a derived grant.

⚠ **And `canAccessAdmin` does not govern every admin route on its own.** Payload skips its auth redirect for any custom view declaring a `path`, so such a view consults the key itself or not at all — see "A custom view that declares a `path` owes its own auth gate" in `docs/rules/admin-ui.md` (#1030).

### What version history exposed (#719)

This is not Payload's default, and the default is the permissive one. `findVersions`, `findVersionByID` and `countVersions` consult `access.readVersions` alone — the published-only constraint in the `read` branch never runs for them. With `readVersions` unset, `executeAccess` falls back to "is anyone logged in", which an API key satisfies, so every draft on `pages`, `meditations`, `app-cards`, `events`, `clients` and the three translations globals was readable by any published client key — including one that cannot read the collection at all.

⚠ **A `Where` from `update` must be translated before it reaches a versions query.** `update` returns a query over _documents_; every versions operation combines the access result straight into a query over the _versions_ collection without remapping it, where a document's fields sit under `version.` and its id is `parent`. `appendVersionToQueryKey` (exported by `payload`, and what `replaceWithDraftIfAvailable` applies to the `read` result) is the mapping. Skip it and `{ id: { in: [7] } }` matches version _rows_ by their own primary key — a wrong answer that still returns documents.

Two consequences worth knowing:

- **A read-only manager no longer sees the History tab.** `/api/access` computes `readVersions` from this same function, so the admin UI follows. That is the intended behaviour change, not a regression.
- **Live preview is untouched.** It reads drafts through `find`/`findByID` with `draft: true`, which resolves against `read` and the live-preview branch — never through a versions operation.

### What the login lockout exposed (#748)

Whoever may edit an account may clear its login lockout. Nobody else.

Payload fills an _omitted_ `unlock` from its collection defaults (`collections/config/defaults.js`) with `defaultAccess` — `Boolean(user)` — which a published client's API key satisfies. `unlockOperation` is the only reader, and `POST /:collection/unlock` is registered for every auth collection, so any client key could reset a locked manager's failed-attempt counter and defeat the brute-force lockout (`maxLoginAttempts: 5`, `lockTime: 10 min`). `clients` was already denied structurally by `disableLocalStrategy: true`, which throws `Forbidden` before the access check; `managers` was the live target.

⚠ **Nothing else needs the grant.** A lockout expires by itself once `lockUntil` passes, and a successful login then calls `resetLoginAttempts` with no access check. `unlock` is only the administrative shortcut that clears a lockout early, so denying it costs a non-admin nothing.

One difference from `readVersions`, and it is the whole `DERIVED_GRANTS` table: `unlock` queries the **auth collection itself**, which is what `update` already answers about, so its `Where` passes through untranslated.

**A non-admin manager no longer sees the admin panel's Force unlock button.** `getAccessResults` computes `unlock` for every auth collection with a `maxLoginAttempts`, and the auth edit view renders `force-unlock` only when that result is true — so the UI follows this function, exactly as the History tab followed `readVersions` in #719. That is the intended behaviour change, not a regression: before it, every logged-in manager saw the button.

Document locking is unrelated: that is the `payload-locked-documents` collection with its own access config, and it never reads `access.unlock`.

### Self-access

A user can always read their own document in their auth collection. **Update is for `managers` alone** (#827).

A manager row is a person's profile, so the person must edit their own name, email and password — `type` and `roles` carry admin-only field locks for the parts that are not theirs to change. A `clients` row is operator configuration end to end: `roles`, `site`, `region`, `canonical` and the `usage` counters. There is no half of it a service may edit, so the grant is withdrawn whole rather than locked field by field, and the next field added to `Clients` is closed by default.

⚠ **Read is what boots the atlas widget**, over `GET /api/clients/me`, and nothing else answers it. Narrowing the update half is safe only because no `clients` write depends on the client's own grant: every `payload.update({ collection: 'clients' })` runs with `overrideAccess: true` or in a job with no user, and `POST /api/clients/report` writes `embedMetadata` through the pg pool rather than through Payload. `disableLocalStrategy: true` means no login, logout or refresh writes the row either.

Withdrawing the bypass is the whole close: no client role names `clients` at all, so the role table has nothing to fall back to.

⚠ **Spelled as an allowlist** — `user.collection === 'managers'`, the same polarity as `managersOnlyFieldAccess` and for the same reason. A third auth collection then arrives with no self-update rather than inheriting it.

### A collection in no project fails closed

Implicit read (step 4a) asks one question: does the role's project name this collection? `isImplicitlyReadable` (`config/projects.ts`) is that test. A collection in no project is therefore reachable by an explicit `read` grant, the admin bypass, or self-access, and nothing else — `users`, `user-submissions`, `managers`, `clients` and `imports` today, each held there for a reason its docblock names. A new collection starts closed; putting one in a project is what opens it to that project's roles.

⚠ **It used to be the opposite.** For read, "no project" meant shared, readable by every role, and an opt-out list, `RESTRICTED_COLLECTIONS`, was all that kept personal data and credentials out of that rule. It named every project-less collection, so it was complete — and would have failed open on the next one. The history below is why each entry was added.

⚠ **Admin-nav visibility is a separate rule** and keeps "no project means everywhere" (`isCollectionVisibleInProject`): it decides where a collection is listed, never who reads it.

⚠ **`managers` left the shared rule because "no project" was reading as shared** (#821): every published API key, the Atlas widget's browser key included, read every manager's name and email. **No client role gets a grant back.** `atlas-region-manager` holds the only one, because it picks on `Events.manager` and `Regions.managers`; `atlas-event-manager` and `web-translator` get nothing and render a raw id, which is the accepted cost.

⚠ **That one grant is collection-wide, and narrowed field by field instead** (#908). A picker exists to list _other_ managers, so the `Where` cannot be self-scoped — and unnarrowed it handed every Atlas region manager every manager's phone number, messaging handles, notification preferences and verbatim legacy import row. `lockManagerFieldReads` (`src/collections/Managers/access.ts`) gives every field a `read` lock bar `MANAGER_PUBLIC_FIELDS` — `name`, which is `admin.useAsTitle` and all a picker renders. The sweep in `tests/int/managers-access.int.spec.ts` is what keeps that allowlist the whole story: it walks the booted collection's `flattenedFields` — the base auth fields and `loginPlugin`'s columns included — and evaluates each lock as a non-admin manager reading another row, so a column cannot arrive readable unnoticed. **Evaluated, not counted** — `read: () => true` carries a lock and leaks anyway, and so did the base `_verified` field's `defaultAccess`.

⚠ **`clients` left it because the same default exposed every service's credentials** (#822): a published key read every other service's decrypted `apiKey`, origin allowlist and usage counters. A service's own listed managers still reach it, through the document-manager path in `accessConfigs.ts`.

⚠ **`imports` sits in no project because a class import is kept for the retention window** (#907): its skipped rows carry contact names, phone numbers and email addresses. The collection declares its own `access` block (`src/plugins/eventImport/importCollection.ts`): any manager who may create classes may create one, admins and the managers of the target region's subtree read and delete, nobody updates. `atlas-region-manager` holds `imports: create`, which is also what keeps the collection's admin pages visible to them.

⚠ **Keeping a collection out of every project reaches a relationship to it. It does not reach a copy of it.** Every `relationTo: 'managers'` field is covered and needs no lock of its own, because populate falls back to the bare id once the related read is refused. A field storing a manager's name or address _as a value_ is not covered, and needs a field lock instead — which is the next section, and why two fields on `events` have one.

⚠ **And a field lock reaches no read that passes `overrideAccess: true`, so a projection built from one owes a `select`.** `UserSubmissions.previewEvent` and `proposedChanges` resolve the assigned manager that way — to name them rather than print a row number — and both are readable by every manager, `atlas-region-manager` included. Unselected, that handed a colleague's whole row over through a copy: the same exposure #908 closes one collection away. The read takes `select: { name: true }`, and `user-submissions-review-lifecycle.int.spec.ts` asserts the projected shape **exactly**, so a column added to `Managers` cannot ride along. **Whenever you resolve a restricted row with `overrideAccess: true` into something another role reads, select the columns you render.**

⚠ **And nowhere else — a `select` added to a read whose own gate reads the row fails open.** Four reads here are correct precisely because they are unselected: `verify.ts` and `eventImport/task.ts` both refuse a deactivated manager on `manager.type`, so narrowing either would make every revoked verification link work again, and `syncVerificationOnSave` plus `SendRegistrationDigests` read `notificationPreferences` — the silent 30-days-to-90 fallback recorded above. The rule is about a row that is **copied into a surface**, never about one a gate interrogates and discards.

⚠ **It does not cover the caller's own row.** Self-access read answers at step 2, before the check, so a published client still reads its whole `clients` document over `GET /api/clients/me` — deliberately, because the atlas widget suspends on that read at every boot. Keeping `clients` out of every project is what stops a key reading _other_ services (#822); the field lock below is what keeps `apiKey` out of its own answer. Neither layer does the other's job.

⚠ **A collection's own `access` block outranks all of this**, because `accessPlugin` composes `{ ...createAccessConfig(slug, …), ...collection.access }` so a deliberate override is never clobbered. A plugin-created collection can therefore arrive with an `access` nobody here chose: the form-builder's submissions collection ships `read: ({ req: { user } }) => !!user`, which grants read to every authenticated user, API clients included. `src/plugins/formBuilder` clears it for `user-submissions` for exactly that reason. **Leaving a collection out of every project proves nothing on its own** — assert it by reading rows back through `overrideAccess: false`, as `tests/int/user-submissions-access.int.spec.ts` does. Asserting `hasPermission` alone would have passed while the hole was open.

### Payload's own `payload-*` entities

⚠ **`accessPlugin` never sees them.** `sanitizeConfig` appends `payload-jobs`, `payload-jobs-stats`, `payload-locked-documents`, `payload-preferences`, `payload-migrations` and `payload-kv` after every plugin has run, mostly with `Boolean(user)` access — which a published client key satisfies. Any client key could queue or rewrite jobs, call `/api/payload-jobs/run`, overwrite the job-stats global, create locks, and PATCH another user's preference row into its own.

`restrictPayloadSystemEntities` (`systemEntities.ts`) sets their access on the **sanitized** config, so every `buildConfig` call site applies it — `src/payload.config.ts` and `tests/utils/testHelpers.ts`. ⚠ Nothing enforces that coupling but prose, so count the call sites when you add one. Not `onInit`: dev hot reload swaps in a freshly sanitized config without re-running it.

In-app job callers (autoRun, the screening kick) leave `overrideAccess` at its default `true`, so none reaches `jobs.access`. `tests/int/payload-system-access.int.spec.ts` sweeps every `payload-*` entity's access for a client key.

### A field lock, for a collection a client reaches

Project membership is collection-wide, and sometimes only one field must be hidden from a client — on a collection the client legitimately reads, or on the one row restriction never covers, its own. `managersOnlyFieldAccess` (`@/plugins/access`) is that lock, read and write alike. ⚠ **It is spelled as an allowlist** — `req.user?.collection === 'managers'` — so it denies an anonymous caller and any future auth collection, not only `clients`.

It is deliberately **wider** than `adminOnlyFieldAccess`, which is the wrong tool for this: a client's own managers must be able to configure their service, and document-level manager access already decides which clients each manager sees. Five fields carry it:

- ⚠ `Clients.apiKey` — the base auth field. Until Payload 3.90 it was decrypted on every read, so without the lock `GET /api/clients/me` handed a browser-shipped key its own plaintext credential (#822). Payload now strips a stored key from **every** read itself (`omitAPIKey`, exposing only a `hasAPIKey` boolean), and the one way to read a key back is `POST /api/clients/:id/api-key/reveal`, enabled by `useAPIKey: { reveal: true }`. That endpoint requires admin access, `update` on the row, and then this field's own `update` lock — so the lock is still load-bearing: it is the last gate on reveal, and the whole gate on a client choosing its own key. Declare it at the **top level** of `Clients.fields`: `mergeBaseFields` matches by name only at the level it is handed, so a copy nested in a tab sanitizes to two `apiKey` fields instead of one.
- `Clients.mailingList` — the same self-read would otherwise hand a service's own key its provider secret (`docs/rules/clients.md`).
- `Forms.client` — `forms` keeps the form-builder plugin's `read: () => true`, which outranks the generated access config, and populating a `clients` document hands over a plaintext `apiKey` (#822). Belt and braces now that `clients` is restricted, and it stays: it is the half that survives if the collection is ever unrestricted.
- `Forms.recipient` — the same collection, and now defence in depth behind restricted `managers` (#821).
- `Events.registrationNotificationEmail` — a manager's address _copied_ onto a collection the `sahaj-atlas` project reads (#821).

⚠ **Reach for a field lock, not project membership, whenever personal data is denormalized rather than related.** `Events.activityLog` is the same shape one step further out — a related row per entry, each reminder recording the address it went to — so the lock lives in the `logField` factory (`src/fields/logField.ts`) and every consumer inherits it. That default keeps the log from clients only; `Events.activityLog` narrows `read` further through the factory's `read` option, to the managers who may contact the people in it (`eventContactsFieldAccess`, below). The sibling `Events.contactEmail` deliberately has no lock: that one is the address a seeker is meant to write to.

⚠ **A locked field still appears in `payload-types.ts`.** The lock strips the value at runtime, not the shape from the generated type.

⚠ **A denied `array` comes back as `[]`, not absent.** Access control deletes the key and the array branch then re-assigns an empty array (`payload/dist/fields/hooks/afterRead/promise.js`). `Managers.contactDetails` and the base `sessions` field are both this shape, so a spec asserts the emptiness — `toBeUndefined()` fails against a correct implementation.

#### `selfOrAdminFieldAccess` — the other question a field lock can ask

`managersOnlyFieldAccess` asks which collection the caller comes from. `selfOrAdminFieldAccess` (`@/plugins/access`) asks whether the caller **is** the row, and admits admins. It is what narrows `atlas-region-manager`'s collection-wide `managers: read` to the picker's title (#908), and it is spelled as the same allowlist, so a third auth collection arrives denied.

⚠ **The row id arrives under two names, and a lock that reads only one hides the holder's own inputs.** The predicate resolves `id ?? doc.id`; its JSDoc carries which read supplies which name, and why a create and the collection-level `/api/access` both read as admin-only.

⚠ **A field appended after the collection's own locker runs needs its own lock.** `loginPlugin` appends `magicLinkIssuedAt`, `lastLoginAt`, `pendingInvitation` and `invitationDueAt` to `Managers` after `lockManagerFieldReads` has mapped its fields, so all four carry `read: selfOrAdminFieldAccess` where they are declared. `email` and `_verified` go the other way: they are base auth fields, merged in at sanitize, so `Managers` declares each one bare at the **top level** for `mergeBaseFields` to merge the lock onto — a copy nested in a tab appends a second field instead.

⚠ **A field lock only covers a read that checks access, and not every self-read does.** `POST /api/clients/refresh-token` handed a browser-shipped key its own decrypted `apiKey` and its `mailingList` provider secret, with both locks in place (#822). `stripLockedFieldsOnSelfRead`, the `afterRead` hook `accessPlugin` attaches to every auth collection, is what closes it, and its JSDoc carries why the hole is Payload's auth operations rather than anything about `clients`. **When you lock a field on an auth collection, lock it and then check what else re-reads the row.**

⚠ **That hook's own-row test is required, not a tidy-up.** Without it a stripped `notificationPreferences` silently moved an event's `nextCheckAt` from 30 days to 90 (#908). It leaves the hook a no-op on `managers` and live for `Clients.apiKey`, the one field locked against its own holder — the hook's JSDoc carries that case and the residual the test leaves.

#### Contacting another manager — one gate, read past the locks

The locks leave a region manager with names alone, and they still have to follow up with the people their region names. So, as with an event's Registrations tab, the contact details come back through a surface that checks its own gate and then reads with `overrideAccess: true` — never by widening a field lock per reader (#908, which first tried that and found it needed a projection per JSON entry and a doc-less refusal per lock).

`mayReadManagerContacts(req, { region, manager })` (`regionSubtreeAccess.ts`) is the gate: an admin, the event's own manager, or an active manager whose owned subtree holds the region. That is a region's co-managers and the managers of every region above it — downward only, so a city manager reads the region above them by name, in the picker, and no further. It judges the place, never the person shown. Two surfaces use it:

- **The manager contacts table** (`src/components/admin/ManagerContacts/`) is the `Description` of `Regions.managers` and `Events.manager`, rendering the field's own description and then the table under it, with an empty `afterInput` so it re-renders after a save: name, a `mailto:` email and the last sign-in, in red past six months. ⚠ It reads the stored row by the id it is handed, never the form `data` a form-state request can carry, and for an event it reads the published row, as the Registrations tab does. Its manager read takes `select: { name, email, lastLoginAt }`, under the projection rule above.
- **`Events.activityLog`**, through `eventContactsFieldAccess`: the same gate on the row in hand. ⚠ With no row — a `where`, a `sort`, `/api/access` — it answers for admins alone, and a read that selects the log without `region` and `manager` is refused rather than re-read. The one copy of the row another role reads, `UserSubmissions.previewEvent`, loads its target with `select: { activityLog: false }`: a proposal reaches the managers of the region it proposes, who need not be the event's. `user-submissions.activityLog` keeps the factory default, because `managerSubmissionScope` already admits exactly these managers to the proposal rows whose deliveries it records.

⚠ **Accepted gap (Ardnived, 2026-10-30): an assignment the reader made counts.** The pickers do not limit their picks, since listing every manager by name is what the grant is for, so a region manager can name anyone on an event or region inside their subtree and then read that person's email in the table. On a published event a draft-only reassignment shows nobody new until it is published, but a new event's first save is its stored row, draft or not — and either way the assignment queues the assignee an invitation. It is far narrower than every region manager reading every manager, which is where #908 started.

`lastLoginAt` is what the table's last column reads. `loginPlugin` appends it and `createSession` stamps it, the one place a session is minted; `update: () => false` keeps it the system's, and it carries its own `read: selfOrAdminFieldAccess` for the reason the other appended columns do.

| Want                            | Do                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Nobody reads it implicitly      | Leave it out of every project                                                       |
| A client may still create it    | Grant `['create']` in that client's role                                            |
| **No manager role may read it** | Grant it in **no** role                                                             |
| Only _some_ rows, for a manager | Grant `read`, then narrow to a `Where` in `createAccessConfig` (`user-submissions`) |
| Visible in `/api/docs`          | Add it to a project's `collections` (`docs/rules/openapi.md`)                       |

Both public intakes' POSTs are `x-internal` for exactly this reason: neither sits in a project.

### A child row whose parent's state no `Where` can reach

The published-only clause and Payload's trash filter are both **per collection**, so a child
carrying neither answers for a parent that refuses to be read at all — which handed every client
key a draft meditation's full spoken text and the R2 key it plays from (#968). The fix was a
`Where` over the parent relationship, spelled against the relationship rather than a resolved id
list because the same clause is combined into the join query (`sanitizeJoinQuery`), where an id
list would cost a second round trip on every parent row.

⚠ **That fix is unavailable once the parent is polymorphic.** Payload resolves `source`,
`source.relationTo` and `source.value` on a `relationTo` array and throws
`APIError('Not supported')` on anything deeper, so `source._status` cannot be written in any form.
`transcripts` is that case (#1043).

**So on `transcripts` the narrowing is gone and nothing replaced it** (#1075). A client whose
project names the collection reads every row, a draft or trashed meditation's included. Project
membership is the whole gate, and the collection sits in `wemeditate-web` and `wemeditate-app` —
`sahaj-atlas` reads none.

⚠ **That reopens #968 deliberately, and it is wider than the cues.** The row also carries
`audioFilename`, which `getR2Url` turns into a **public, unsigned** delivery URL, so the exposure
is the recording of an unpublished meditation and not only its text. The owner priced both on
#1075: a transcript holds no personal data, and a client reading one is one that reads the
recording. **Say which of the two a later reader is relying on** — "already reads the recording"
is true of a published meditation and not of a draft.

**A later child row in this shape owes the same judgement, not the same answer.** Weigh what the
row holds before leaving it on project membership. The two narrower homes both cost something: a
client-key refusal puts "who may read this" in a second place, and a per-role grant leaves a
silently broken admin tab for the next role nobody lists.

## Adding a new role

1. Add it to the `ROLES` constant in `src/plugins/access/config/roles.ts`.

Lookup tables compute automatically. No manual update is needed.

2. Run `pnpm generate:types` to regenerate `RoleSlug`.
3. List it in `Managers.roles`' `getRoleOptions([...])` — unless it declares `virtual: { join: '<joinField>' }`, which `getRoleOptions` refuses. That join name is the whole declaration — `virtualRoles` grants the role whenever the join's `docs` are non-empty, so there is no predicate to write. What a virtual role owes instead is a reason the join cannot go stale.
4. Add tests in `tests/int/role-based-access.int.spec.ts`.
