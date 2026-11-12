---
paths:
  - src/collections/Clients/**/*.ts
---

# API Clients — the `clients` record

What a `clients` document holds beyond its key: where its atlas lives (`site`), the region it may own and the embeds that prove it (#633), the per-region `webUrl` it owns (#634), and a service's mailing list. How a client authenticates, what it may read and write, and how it is counted and rate-limited is in `docs/rules/api-clients.md`.

## Clients collection (`src/collections/Clients/Clients.ts`)

- `useAPIKey: { reveal: true }` — Payload generates an API key per client. Managers regenerate keys and manage settings through the **document-manager** path, not a role: no role holds any `clients` grant, so an admin, or a manager listed in that client's `managers` field, is the whole of who reaches the document. No read returns a stored key (Payload 3.90+) — the admin's **Reveal** button, `POST /api/clients/:id/api-key/reveal`, is the only way to see one again, gated as in `docs/rules/access.md`.
- **No drafts.** `enabled` (Config tab, admin-only) is the switch a key works by — `bypassPermissions` and `requireActiveClient` deny anything but `enabled === true`. One row per service, so a save builds on the row itself, and what the usage plugin and the report endpoint write straight to it survives the next save (with drafts, every save rebuilt the row from its latest version row and reverted both).
- **The Config tab is admin-only, writes included.** `label`, `enabled`, `notes`, `roles` (labelled Access), `managers`, `primaryContact` and `region` carry an admin-only write lock as well as the tab's condition: a listed manager holds `update` on the row through document-level access, and a hidden field stops no PATCH. `lockTabs` stamps that lock on every field of every conditioned tab, matching the tab's condition against `TAB_WRITE_RULES` by **function reference** — so a tab whose condition is written inline matches nothing, and refuses to build rather than shipping with no lock and no validation.
- ⚠ **`clients` sits in no project, so no role reads it implicitly, and `apiKey` is locked on top of that** (#822). One key read every other service's decrypted key until both landed. The reads a client still gets are of its own row — `GET /api/clients/me` and `POST /api/clients/refresh-token` — and the field lock plus `stripLockedFieldsOnSelfRead` are what keep the key out of those answers. See `docs/rules/access.md`.

## Where the atlas lives — `site` (one domain, one page)

A service is **one site**: `site.domain` (a bare host) plus `site.page` (the primary page's path), with `site.track` and `site.embedHeight` remembering the Install tab's choices. All four are the Install tab's, and `admin.disabled` keeps them out of the edit form's state, so saving the form can never write an older copy back. `src/lib/clients/site.ts` is the vocabulary every reader shares:

- **`siteHosts(domain)`** is the whole origin allowlist: the domain and its www or bare twin. No wildcards, no second domain — a second site needs a service and key of its own. No domain means no browser origin to enforce, which is an app's key. ⚠ An empty list is **not** the same as no domain: **`hasSiteDomain(domain)`** answers that, and a domain naming no host is refused every origin rather than allowed any (`docs/rules/api-clients.md`).
- **`primaryPageUrl(site)`** is the page that is verified, probed, routed from and, for an owner, published on — always `https://` on the bare host.
- **`reportedMountsFor(embedMetadata, site)`** is the widget's reports from that page, on either host, newest first, and **`supportsClassAddresses(record)`** reads from the newest whether the page can give a class its own link (inline, and able to write the URL). That observation, not the chosen track, decides whether a site may own its region.

Any other page on the same domain is a secondary embed automatically: it reports, it shows on the Install tab as evidence, it owns nothing.

A service's own **look** is `src/lib/clients/appearance.ts`, not `site.ts` — the three atlas colours, the logo shown to a service with none, and whether a stored colour carries a hue at all. `src/lib/branding/` is the per-project brand, a third vocabulary again.

⚠ **`allowedDomains` and `canonical.embed` are computed compatibility fields**, no columns behind them, read from `site` for the widget's current `/clients/me` select (the analytics domain and the `routing=path` prefix). They go once SahajAtlasWeb reads `site` directly.

## Region ownership + observed embeds (#633)

`region` is set by an admin and does two things on purpose: it is where the map opens, and the region whose atlas links the service's site may own. Empty is **Worldwide** — the map opens on the world and the site owns nothing, except the client `sy-atlas-config` names as the canonical fallback.

### `canonical.owned` — who owns a region's canonical URLs

`client.region` alone can't identify an owner — several services can map to one country. Ownership is a flag the server writes: every Check on the Install tab (`POST /api/clients/:id/verify-embed`) claims it when the region is unowned, the page has reported and can give classes their own links; the VerifyEmbeds job clears it after three failures; an admin may release it on the Diagnostics tab.

**One definition of ownership, read everywhere.** `CANONICAL_ELIGIBLE` (`owned` and `enabled`) plus `canonicalOwnerFrom` (`verifiedHomeHost`: a valid verified host, still the service's current page) in `src/lib/atlas/regionOwners.ts`, with `ownedHost(row)` (`src/lib/clients/site.ts`) as the in-memory twin for a row already in hand. Canonical URLs, the sitemap, the SEO root, the fallback client, the registrant emails' site link and the Install tab all go through them — the emails link to `https://<verified host>` only while the service owns its region.

`validateCanonicalOwnership` (beforeChange) enforces the rest: a second owner of a region is rejected, naming the incumbent; a Worldwide service cannot own unless it is the fallback; and **ownership does not follow a region change** — moving an owning service clears the flag, and the next Check claims the new region if it is free. It skips when nothing the rule reads has moved.

### Verification — how a nomination becomes a canonical URL

The primary page is only a nomination. A canonical URL is built from `canonical.verification.verified`, written **solely** by the CMS after it loads the page itself — a real browser is required, since the widget is JavaScript and fetching HTML would only prove a `<script>` tag exists.

- **The marker** is `data-sahaj-atlas-ready` on `<html>`, carrying `{ v, routing, topLevel, urlWritable }` (the cross-repo contract from sydevs/SahajAtlasWeb#153, #159). Its `routing` says what the widget was asked to do, so the verifier no longer records it — see "Routing is derived, never configured" below.
- **`src/jobs/VerifyEmbeds`** runs nightly, watermarked on `nextVerifyAt`, bounded to enabled services. Three consecutive failures turn ownership off, via the atomic-SQL seam, not `payload.update`, and stamp `verification.releasedAt` when the service owned its region. It mails nobody (#1055): from the first miss the service is a "Map not found" open item, in its managers' "Your websites" digest and an admin's list, which says so once the region has gone. A success clears both, and gives the region back unless another site has taken it.
- **`POST /api/clients/:id/verify-embed`** — manager-authenticated, the same routine on demand. A press is never a strike: its failure is logged like an inconclusive one, so it can neither run the three-strike budget down nor disable. Its success still resets the counter.
- ⚠ **Both writers share one statement, `persistVerification`, conditioned on the state each folded from** (`canonical_verification IS NOT DISTINCT FROM`). Each spends seconds rendering between its read and its write, so whichever finished second used to discard the other's attempt and failure count (#1116). A lost race is logged and left: the other writer looked at the page later.

**`failed` vs `inconclusive` is load-bearing.** `failed` counts toward the three-strike budget. `inconclusive` (a provider error, exhausted quota, a bot challenge, missing credentials) means we couldn't look, and changes nothing. `classifyRenderError` biases an unrecognized message to inconclusive, and checks quota before timeout, so an exhausted allowance of our own is never misread as the embed timing out.

**Exercised for real** by `pnpm tsx scripts/verify-embed-live.ts --self-test`, which drives all four outcomes against the live API — every unit test stubs the render. Its error codes (`6002` selector timeout, `5006` network/DNS, `10000` auth) are pinned in `tests/unit/embed-verification.spec.ts`. Prose matching is a fallback only, since the messages are generic enough to be misleading.

**What the marker proves, precisely.** It detects an embed that is installed and _not working_ — the one thing a client-sent report can never reveal. It does **not** prove the page is honest: the attribute carries no nonce, so any host running our script can hand-write it. The trust boundary stays the service's domain. What the marker buys is that a stolen key can claim a mount on the client's domain, but can't make that domain serve a marker it doesn't control.

### Routing is derived, never configured (#644)

Nothing lets an operator — or a script tag — say how a client's URLs are shaped. **`verification.routingProbe.verdict`** (`src/lib/clients/verification.ts`) is the one answer, read by `canonicalOwnerFrom`, by the Install tab, and by the widget through the virtual `canonical.routing` field on `GET /api/clients/me`.

Read it at the call site, as `verification?.routingProbe?.verdict ?? 'query'` — there is no accessor to wrap it. The default belongs to the read path, and the `canonical.routing` field's `afterRead` hook is where it is applied for anything reading through Payload. The remaining sites never read the field: they hold the verification object they are about to write or have just written (`VerifyEmbeds`, the `verifyEmbed` endpoint), or they read the row through their own `select`, which does not run the hook (`canonicalOwnerFrom`).

`routingProbe` is a sibling of `verified`, and it is the record's only routing answer. The readiness marker's copy of the widget's own script parameter is not recorded on `verified`: shaping a public URL from it was circular, and a second stored answer is a second thing to read by mistake. The widget's report is still kept as a report, per mount, in `embedMetadata`. The old `verified.routing` key was stripped from every row by the one-site migration (#1055), and the closed schema no longer declares it.

- **The probe is a second render, not a new subsystem.** `probeRouting` loads `<mount>/<random-token>` and the control `<origin>/<random-token>`. A positive needs both: the marker under the prefix **and** its absence at the origin, which is what a host mounting the widget on its own 404 page fails. The token is random and never a real slug — a site can hand-build `/gb/london`, and one working page proves nothing about the subtree.
- **The two probe renders start together, and that is a latency rule, not a verdict rule.** The verdict still reads the probe first and returns it unless positive. Sequentially the promote path was three renders end to end at `RENDER_TIMEOUT_MS` each, and Cloudflare abandons an origin response at 100s — so a Check answered a 524 on the very press that promoted a service, after the row was written. The cost is the control render on a host that fails the probe, where it used to be skipped: an enabled owner now spends three renders (mount, token, control), which is the budget #644 sets, and one where the mount verification failed.
- **Both URLs are derived from the primary page in one place** (`routingProbeUrls`), so an operator-typed string cannot reach the renderer by another route. A mount carrying a query string is a negative spending no render — `canonicalUrlBase` refuses that combination anyway.
- **The ladder is asymmetric, because the failures are.** A wrong `path` 404s every deep link and puts dead URLs in the sitemap. A wrong `query` only produces uglier URLs that work. So: promote on one positive, demote only after `ROUTING_PROBE_FAILURE_LIMIT` consecutive negatives.
- **Its own counter, never `failureCount`.** That one becomes `disable`, which switches canonical ownership off. A routing negative means the embed is present and publishing, so a shared counter would delete working public URLs over a URL-shape preference. `query` is a real canonical: the builder has a full arm for it, it is the default in both readers, and six `query` cases are pinned in `atlas-url-contract.json`.
- **The verdict survives a null `verified`**, which is why it sits beside it: a client should path-route as soon as its host serves the subtree, whether or not it is publishing canonical URLs yet.
- **A Check (`verify-embed`) may demote, where it may not disable.** Three presses return a client to `query` in a minute, with evidence — which is why there is no manual override field. The accepted cost: a host that serves the subtree but refuses headless renders (`bot-challenge`) stays on `query`, which is what it has today.
- **Nothing backfills the verdict**, so every service reads `query` until it is probed, including one publishing `path` canonicals before the deploy. Backfilling from the marker's `routing` would re-introduce the self-report this rule removes, and each existing embed is re-verified by hand anyway. The operator step is in [`DEPLOYMENT.md`](../../DEPLOYMENT.md#-post-deploy-step-re-verify-each-canonical-owning-client-644).

Vocabulary lives in `src/lib/clients/canonical.ts`, the verification contract in `src/lib/clients/verification.ts` — not the collection folder, since the job and the verifier both need it (`src/AGENTS.md` rule 4). `legacyConfig` was removed, not promoted: nothing backfills from it, since ownership now requires a verified reported embed.

### `embedMetadata` — what the widget observed

Admin-readonly JSON, keyed by **origin + pathname**, one record per mount (`mode`, `topLevel`, `urlWritable`, `paramPersisted`, `routing`, `lastSeen`). It stays a JSON column because nothing queries it — the ownership resolver loads every client (`pagination: false`, ~31 rows) and filters in memory. ⚠ Revisit if the client count grows an order of magnitude. A `jsonSchema` lets Payload generate the type and reject a malformed write.

**Canonical viability is automatic. Canonical _identity_ is not.** A human designates which discovered mount is canonical. The metadata only decides whether that mount still qualifies. This bounds tampering: a forged report can assert viability only for a mount someone already chose, never invent one the verifier hasn't seen.

**The body is `origin` + `pathname`, two fields.** A query string or fragment is refused, since the endpoint can only enforce "path alone" that way — except a WordPress permalink (`?p=<digits>`), where discarding it would collapse the whole site onto one mount with no way to name the operator's intended page.

**The write is raw SQL, and has to be.** The other party is always another request — this route is unmetered, since `clients` is excluded from the plugin (below). Every _metered_ read under the same client key increments `usage_daily_requests` on that row in autocommit, from the same pool Payload runs request transactions on, and a widget boot issues several on the same page load as the report. `payload.update` would hold the row for the life of the request transaction, so each of those blocks on `Lock: transactionid` while holding a connection that transaction may itself need. An autocommit `jsonb ||` merge has no transaction to hold the row in.

### `POST /api/clients/report`

The write path (`Clients/endpoints/report.ts`). Merges into the keyed object. It never replaces it. Since `clients` is excluded from the usage plugin, no `beforeOperation` hook fires here — the handler gates on `requireClientAccess`, which runs the origin check itself, and usage tracking likewise does not apply.

Two origin checks apply: the request's `Origin`/`Referer` must be the service's domain (`siteHosts`), and so must the reported `url`'s host — a client can only describe pages on its own site, and a service with no domain reports nothing. `url` is origin plus pathname only. A query string or fragment is rejected (`400`, `query_or_fragment`), not stripped, since the widget already strips them and a payload carrying either means the widget is misbehaving.

Rate limiting is Cloudflare's, at the edge, as for every client route. On top of that, a repeat of a recent identical observation gets `updated: false` with **no read and no write** — the widget reports on every page load, so this path carries most of the traffic.

- **The cap bounds storage, never which mounts are knowable** (#639). `MAX_EMBED_MOUNTS` (50) caps what a forger can accumulate. A client at the cap still reports a new mount, evicting the least-recently-seen entry, so the held 50 reflect what is currently live. There is no 429 — refusing growth was tried first, and once ordinary traffic filled the budget an operator's intended page could never get reported. One exception to eviction: the mount just reported can't be evicted by the write that reports it. The primary page's report is not protected — only fifty newer pages can push it out, and its next page load reports it again.

  `mergeEmbedReport` (`embedMetadata.ts`) computes the decision. The endpoint applies it in one statement — `|| $1::jsonb` merges, `- $2::text[]` deletes evicted keys. Both halves matter: `||` alone can't delete, so the column would grow unbounded while the cap stayed inert.

- Registered in the OpenAPI shim but stays `x-internal` (`docs/rules/openapi.md`).

Tests: `tests/unit/client-embed-metadata.spec.ts` (mount keys incl. `?p=`, the merge), `tests/unit/embed-verification.spec.ts` (marker parsing, error classification, failed/inconclusive), `tests/int/client-canonical.int.spec.ts` (the hook, the endpoint, the job ladder, the cap, and that enabling ownership re-roots `webUrl` while `webPath` stays byte-identical).

### Post-install SEO checks — what a crawler can see (#1055)

`verifyEmbed` loads the mount in a real browser and asks whether the widget booted. These checks ask the opposite question over plain HTTP: whether the raw HTML a **crawler** is served carries the `<title>`, canonical, JSON-LD and crawlable body that `GET /api/atlas/seo` answered. A host can pass one and fail the other in both directions, and this failure is invisible to everyone — the page looks perfect to the volunteer who installed it, and is unindexable.

Plain HTTP is the point, not a shortcut: a headless render would show the page _after_ the widget replaced its own children, which is the one state no crawler is in. It is also cheap enough to run on every nightly verification rather than on a button.

- **Two pages, five checks.** The atlas root, because every host mounts it, and the **shallowest region** from the client's own sitemap, because that is the page most likely to be linked and least likely to have been re-slugged. `title`, `canonical`, `json-ld` and `body` run on both; `sitemap` runs on the region alone — a site lists its own mount for reasons that have nothing to do with us, so finding it there would prove nothing.
- ⚠ **Nothing here reaches `failureCount`.** An SEO warning means the embed is _present and publishing_ with one `<head>` field wrong, so sharing that counter would withdraw a working site's public URLs over a missing title. Same category error `routingProbe` keeps its own counter to avoid (#644). The job counts `seoFailing` separately for the same reason.
- ⚠ **`skipped` is not `fail`.** A page we could not fetch, a client with no sampled region, a locale with no copy — none is evidence the install is wrong, and all three are common mid-setup. Only `fail` is shown.
- ⚠ **The body probe is never the page title.** A theme renders the title in the body as well as the head, so a title-shaped probe passes on a page whose crawlable children never arrived — the exact failure the check exists to catch. It comes off `content` instead: a class's name on a region page, the schedule or address line on an event, the first authored paragraph on the root.
- ⚠ **The sitemap check is platform-agnostic by construction.** It reads the `Sitemap:` lines in `robots.txt` — the line every crawler honours whichever SEO plugin runs — plus `/sitemap.xml`, and follows **one** level of sitemap index. ⚠ **Every one of those URLs is a third party's, so each is fetched with the redirect chain bounded to the host under check** (`FetchPageOptions.hosts`): judging the URL before the fetch leaves the hop unjudged, and the platform takes a hop before any caller has an answer to discard. The page fetch is bounded to the mount's own host for a sharper reason: two of the page failures quote what came back — the `<title>` and the `rel=canonical` — so a mount that 302s to an internal address would read that address into the stored detail a manager is shown. It costs nothing, because such a mount already fails the canonical check, and it now says so in plainer words. Four SEO plugins and two site builders each publish their sitemap somewhere else, and adapting to each is the mistake `SahajAtlasWordpress` already decided against.
- ⚠ **The audit reads as the client being checked**, on a copy of the request with that client's own row as `req.user`. The resolvers read `overrideAccess: false` on purpose — the comparison must be against the published-only view a crawler was served — but the caller is a manager pressing Verify or a job running as nobody, and neither reaches a `clients` read. `overrideAccess: true` would compare against unpublished content and report a correct page as wrong on the day it is correct.
- **A failure is an open item, never a mail.** The stored `seo` snapshot is the whole record. `loadOpenItems` reads it into a "Search problem" row, which the service's own managers see in their "Your websites" digest — the `atlas-service-manager` role, derived from `Clients.managers` — and an admin sees in their list and on their home, at the `open_items` pace. A site that stays broken stays on the list until a check passes, and nothing is sent the night it breaks.

The pure fold is `nextSeoCheckState` (`src/lib/clients/verification.ts`), the observation is `src/lib/embedVerification/seoChecks.ts`, and `seoCheckRun.ts` is the seam that gives the second one a database. Tests: `tests/unit/seo-checks.spec.ts`, and the job wiring in `tests/int/client-canonical.int.spec.ts`.

### The Install tab (#1055)

A custom document view on `clients`, at `/admin/collections/clients/:id/install`, written for the one non-technical volunteer who manages each of 13 national organisations' sites. Four platform choices — WordPress (self-hosted or WordPress.com), Wix (Editor or Studio), a custom site, iframe-only — with every value prefilled and a Copy button on each.

- **There is no Verify step.** The address is validated as it is typed; a `*.wixsite.com` or `*.wordpress.com` host is named before an hour is spent on a track that cannot work there; and the moment the widget reports itself from the chosen page the tab confirms the embed, claims the region's canonical URLs if nobody holds them, and runs the SEO checks. A button to remember is a button somebody does not press.
- **Every step has an id**, so a failing check names the step to redo rather than saying something is wrong somewhere. A step nothing can observe says so instead of showing a permanent grey light, and `tests/unit/install-steps.spec.ts` fails a track that routes a check to such a step.
- **Every choice is saved as it is made** — site kind, address, map height, language — with Payload's own `PATCH /api/clients/:id`, so field locks and hooks apply as they do for the form. The region is shown read-only: only an admin sets it. Once the atlas works, a last section links to the Atlas tab for colours, emails and the mailing list.
- ⚠ **The view reveals the API key**, which is why it reads the row through the database adapter — every ordinary read strips the column (Payload 3.90+). It re-reads the document with the caller's own `req` and `overrideAccess: false` first, and evaluates the `apiKey` field's own lock by hand, so it grants exactly what `POST /api/clients/:id/api-key/reveal` requires and no more.
- **`POST /api/clients/:id/verify-embed` claims the region before it verifies**, and is what sets `canonical.owned`. The page is the record's own primary page, and it claims only a page the widget has **already reported** that can give classes their own links, so a forged report can at worst nominate a page that then fails verification — the bound this file already describes. It does **not** re-implement the uniqueness rule: `validateCanonicalOwnership` refuses a second owner and names the incumbent, and the endpoint passes that refusal through in the volunteer's own words, as the reply's `claim`.

The generated Wix snippets — `backend/routers.js`, the router page code, the Custom Element settings — live in `src/components/admin/InstallGuide/templates.ts` and have to agree with `GET /api/atlas/wix/*`; both are in this repo and ship together. Tests: `tests/unit/install-steps.spec.ts`, `tests/unit/install-model.spec.ts`, `tests/unit/wix-templates.spec.ts`.

## Per-region canonical `webUrl` (#634)

`webUrl` is not one global base. It resolves to the client owning the document's region, or the nearest owning ancestor, and falls back to the We Meditate surface when nothing in the ancestry is owned. `SAHAJATLAS_URL` is no longer a canonical base anywhere — it survives only in the two live-preview URLs.

| Piece                                                             | Where                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| The two URL shapes (`path` / `query`), and the cross-repo fixture | `src/lib/atlas/canonicalUrl.ts`, `atlas-url-contract.json` |
| Region tree + ancestor chains, one query per request              | `src/lib/atlas/regionTree.ts`                              |
| Ownership: the `clients` read + nearest-ancestor walk             | `src/lib/atlas/regionOwners.ts`                            |

```
path :  https://{domain}{mount}{webPath}   → https://wemeditate.com/map/nl/amsterdam/1204
query:  https://{domain}{mount}{?|&}atlas={webPath}
                                           → https://sahajayoga.nl/locatelessons/?atlas=/nl/amsterdam/1204
```

- **`webPath` never changes** — the bare ancestor slug chain. Ownership only decides what it's joined to.
- **Two extra queries per request, total** (one `regions`, one `clients`), memoized on the `PayloadRequest`, loaded lazily — a `webPath`-only read never touches ownership.
- **Never a fragment.** Hash routing is gone from the widget with no back-compat.
- **The verified host is re-checked at read time, not trusted** — `VerifyEmbeds` writes via raw SQL, bypassing the JSON schema's domain pattern. `loadDirectOwners` re-validates before the ancestor walk, so an unusable client is skipped rather than collapsing its whole subtree to the fallback.
- **The path is emitted raw**, not percent-encoded — safe only because region slugs are `[a-z0-9-]` and event ids are numeric (`tests/unit/atlas-canonical-url.spec.ts` pins this).
- **Region paths are queryable** via `where[breadcrumbs.url][equals]='/nl/amsterdam'`, but this matches descendants too — add `slug` to resolve exactly one.

## Mailing-list configuration on `clients`

A service that relays subscribe submissions names its own provider, under **Atlas → Mailing List**. The Atlas tab, and so the list, shows only for a service with the atlas role; delivery still reads a stored list whatever the roles, so a service without the role keeps one it already has, which only an admin can then change: every Atlas-tab field is write-locked to an admin or a service with the role (`lockTabs`), because a hidden tab runs no validation. The Install tab shows on every service, and says there is nothing to install on one without the role.

⚠ **No API client can read any of it, at any depth.** Two things hold that up, and both are needed. The group carries `managersOnlyFieldAccess` (`@/plugins/access`), which closes the read project membership never reaches — self-access hands a published key its own row whole over `GET /api/clients/me`. And `stripLockedFieldsOnSelfRead`, the `afterRead` hook `accessPlugin` gives every auth collection, closes `POST /api/clients/refresh-token`, which re-reads the row at `overrideAccess: true` and so skips field access entirely (#822). The group still appears in `payload-types.ts`; both strip it at runtime, not from the generated type.

**Choosing a provider is what turns the list on.** There is no separate switch: an empty
`provider` is no list, clearing it switches one off, and every other field shows only once one is
chosen. Clearing it keeps the other values stored, so choosing it again is proven like a new list.

⚠ **The provider key is write-only.** `mailingList.apiKey` is a `secretField()`
(`src/fields/AGENTS.md`): `read: () => false` on top of the group lock, `admin.disabled` so it is
absent from the edit form's state, and encrypted at rest. Nothing reads it back to any browser —
the Atlas tab's control shows only whether a key is stored and its last four characters. A new key
is checked against the provider and list on the form (saved or not) in the set modal, then staged;
the form's own Save applies it, and `validateMailingList` proves it again against what that Save
stores. The key route writes nothing to the row, so no other field can change with it. Removing a
key stores `''` rather than `null`, so `LIST_ELIGIBLE` drops the service and
`isMailingListConfigured` short-circuits the hook — a removal asks no provider.

⚠ **A chosen provider with no key is refused**, by `validateMailingList` when a credential changed:
no field `required` reaches a key the form never holds, and a key-less list reads as one while
delivering nothing. So a removal clears the provider in the same save.

⚠ **Form state is why, not tidiness.** Payload's live preview posts the whole edit form's state to
the preview iframe on every change, so a key in form state would reach sahajatlas.com
(`docs/rules/admin-ui.md`). Keeping it out is what lets the Clients preview exist at all.

**Credentials are checked when you save them**, by `validateMailingList`, which reads the named list and refuses the save with the provider's own words. Two bounds on that:

- It runs **only when one of the credential fields actually changed** — `provider`, `listId`, `apiKey`, CleverReach's `clientId` and `doiFlowId`, and `doubleOptIn`, which changes what is checked. `provider` is also the on switch, so choosing it again after a list was switched off — and edited while nothing proved it — is proven too. The hook fires on every save of the row, and the Install tab saves each choice as it is made — without the gate, an outage at Mailchimp would lock every client document in the CMS.
- **A provider being unreachable never refuses a save.** An operator cannot fix somebody else's outage, so the credential goes in unproven and delivery is what finds out.

Delivery resolves the target list **at delivery time**, from the subscribe form's `client` or, for a registration-spawned row, the client whose list owns the class's region (#1022). Nothing is stored on the row, so moving a service between providers does not strip pending rows.

**A list owns a region through `clients.region`**, the same column canonical ownership reads — but not canonical ownership itself: it needs no verified embed. `mailingListClientFor` (`src/lib/atlas/mailingListOwners.ts`) walks the class's region chain to the nearest client whose list is complete — a provider, a list and a key, then falls back to `sy-atlas-config`'s `canonicalFallbackClient` (We Meditate) if its list is, then answers none. The Events `offersMailingList` field reads the same function, so the widget offers the opt-in exactly where a list will receive it.

Each provider reports what it can actually justify: Mailchimp and CleverReach `subscribed` or `pending` by the double opt-in checkbox, Brevo always `subscribed` (single opt-in only), Klaviyo always `accepted` — its subscribe job answers 202 with no per-profile result, so it can tell none of the three cases apart. ⚠ **An address that opted out is never re-added.** Mailchimp and Brevo each report it in their own words and the attempt is terminal, never retried; on Klaviyo the case cannot be detected inline, so the adapter uses the plain subscribe job and nothing that bypasses suppression.

**CleverReach is the one provider taking two credentials** (#1086). It issues a Bearer token for the client id and secret of an OAuth app the operator creates under _Account → Extras → REST API_, so `clientId` holds the id and `apiKey` the secret, and `listId` is the group id. A token is minted per delivery rather than cached: volume is low, and a module-level cache would not survive a Railway restart in any useful way.

Its double opt-in is CleverReach's own, which is why the checkbox is rendered for it: the receiver is upserted inactive and `doiFlowId` names the flow that sends the confirmation (`POST /v3/flow/flow/{id}/send`, with `doidata` as the legal record of the opt-in). ⚠ **The receiver is read back before that upsert, and the order is load-bearing** — the upsert carries `activated`, so writing one over a receiver that opted out resurrects them. A deactivated or blocklisted receiver answers `previously_unsubscribed` with no write; one already active answers `subscribed` with no second confirmation mail. `verifyCredentials` reads the group, and the flow too while the checkbox is on, so a wrong id in either field is refused at save time by the field it belongs to. ⚠ A 401 or 403 on either read names the OAuth app's own permissions, never the API key — the token has already proved that one, so the shared "that API key was refused" would send the operator to the one field that is correct.

⚠ **A refused confirmation send is terminal unless it answered 429**, which is the one status saying CleverReach never processed it. By that call the receiver is on the group with `activated` at 0, which reads the same whether the mail went out or not, so a retry on a 5xx mails the same person a second confirmation. The cost of stopping is one subscription the visitor completes by submitting the form again. Every earlier leg keeps the shared ladder, where a 5xx is retryable.

⚠ **`isMailingListConfigured` stays provider-blind**, so a CleverReach row with no `clientId` still reads as configured and the adapter refuses it terminally instead. Both new fields are `required` behind an `admin.condition`, which is what keeps that case to a row no form wrote.
