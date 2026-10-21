---
paths:
  - src/collections/Clients/**/*.ts
---

# API Clients — the `clients` record

What a `clients` document holds beyond its key: canonical ownership and the embeds that prove it (#633), the per-region `webUrl` it owns (#634), and a service's mailing list. How a client authenticates, what it may read and write, and how it is counted and rate-limited is in `docs/rules/api-clients.md`.

## Clients collection (`src/collections/Clients/Clients.ts`)

- `useAPIKey: { reveal: true }` — Payload generates an API key per client. Managers regenerate keys and manage settings through the **document-manager** path, not a role: no role holds any `clients` grant, so an admin, or a manager listed in that client's `managers` field, is the whole of who reaches the document. No read returns a stored key (Payload 3.90+) — the admin's **Reveal** button, `POST /api/clients/:id/api-key/reveal`, is the only way to see one again, gated as in `docs/rules/access.md`.
- ⚠ **`clients` is a restricted collection, and `apiKey` is locked on top of that** (#822). One key read every other service's decrypted key until both landed. The reads a client still gets are of its own row — `GET /api/clients/me` and `POST /api/clients/refresh-token` — and the field lock plus `stripLockedFieldsOnSelfRead` are what keep the key out of those answers. See `docs/rules/access.md`.

## Canonical ownership + observed embeds (#633)

Two Atlas white-label fields, split across the **Config** and **SEO** tabs. `canonical.enabled` defaults false, so a client owns nothing until opted in — but once opted in **and verified**, these fields build `webUrl` for the client's region (#634, below).

### `canonical` — who owns a region's canonical URLs

`client.region` alone can't identify an owner — several published clients can map to one country. Ownership is an explicit opt-in with a uniqueness rule.

`validateCanonicalOwnership` (beforeChange) enforces this: enabling requires `region` and `canonical.embed`, and a second enabled client on a region is rejected, naming the incumbent. It watches `region` too, so moving an enabled client onto an owned region can't dodge the check, and skips when nothing the rule reads has moved. Uniqueness checks against **committed** state, so a conflicting draft is caught only on publish.

`required` plus an `admin.condition` is the mechanism, not a hazard — Payload skips both `required` and a custom `validate` while the condition is false, so `required` on `embed` reads as "required when ownership is on." An integration test saves a canonical-disabled service with no embed through a plain API write, proving this holds for non-admin writes too. The whole gating design rests on it.

### Verification — how a nomination becomes a canonical URL

`canonical.embed` is only a nomination. A canonical URL is built from `canonical.verification.verified`, written **solely** by the CMS after it loads the page itself — a real browser is required, since the widget is JavaScript and fetching HTML would only prove a `<script>` tag exists.

- **The marker** is `data-sahaj-atlas-ready` on `<html>`, carrying `{ v, routing, topLevel, urlWritable }` (the cross-repo contract from sydevs/SahajAtlasWeb#153, #159). Its `routing` says what the widget was asked to do, so the verifier no longer records it — see "Routing is derived, never configured" below.
- **`src/jobs/VerifyEmbeds`** runs nightly, watermarked on `nextVerifyAt`, bounded to enabled services. Three consecutive failures turn ownership off and notify `primaryContact`, via the atomic-SQL seam, not `payload.update`.
- **`POST /api/clients/:id/verify-embed`** — manager-authenticated, the same routine on demand. It never disables.

**`failed` vs `inconclusive` is load-bearing.** `failed` counts toward the three-strike budget. `inconclusive` (a provider error, exhausted quota, a bot challenge, missing credentials) means we couldn't look, and changes nothing. `classifyRenderError` biases an unrecognized message to inconclusive, and checks quota before timeout, so an exhausted allowance of our own is never misread as the embed timing out.

**Exercised for real** by `pnpm tsx scripts/verify-embed-live.ts --self-test`, which drives all four outcomes against the live API — every unit test stubs the render. Its error codes (`6002` selector timeout, `5006` network/DNS, `10000` auth) are pinned in `tests/unit/embed-verification.spec.ts`. Prose matching is a fallback only, since the messages are generic enough to be misleading.

**What the marker proves, precisely.** It detects an embed that is installed and *not working* — the one thing a client-sent report can never reveal. It does **not** prove the page is honest: the attribute carries no nonce, so any host running our script can hand-write it. The trust boundary stays `allowedDomains`. What the marker buys is that a stolen key can claim a mount on the client's domain, but can't make that domain serve a marker it doesn't control.

### Routing is derived, never configured (#644)

Nothing lets an operator — or a script tag — say how a client's URLs are shaped. **`verification.routingProbe.verdict`** (`src/lib/clients/verification.ts`) is the one answer, read by `canonicalOwnerFrom`, by the admin picker's preview, and by the widget through the virtual `canonical.routing` field on `GET /api/clients/me`.

Read it at the call site, as `verification?.routingProbe?.verdict ?? 'query'` — there is no accessor to wrap it. The default belongs to the read path, and the `canonical.routing` field's `afterRead` hook is where it is applied for anything reading through Payload. The remaining sites never read the field: they hold the verification object they are about to write or have just written (`VerifyEmbeds`, the `verifyEmbed` endpoint), or they read the row through their own `select`, which does not run the hook (`canonicalOwnerFrom`, the picker).

`routingProbe` is a sibling of `verified`, and it is the record's only routing answer. `verified.routing` — the readiness marker's copy of the widget's own script parameter — is no longer written: shaping a public URL from it was circular, and a second stored answer is a second thing to read by mistake. The widget's report is still kept as a report, per mount, in `embedMetadata`. The key stays in the verification schema as an optional legacy property, since that object is closed and validated on every save, so deleting it would strand every row verified before this change.

- **The probe is a second render, not a new subsystem.** `probeRouting` loads `<mount>/<random-token>` and the control `<origin>/<random-token>`. A positive needs both: the marker under the prefix **and** its absence at the origin, which is what a host mounting the widget on its own 404 page fails. The token is random and never a real slug — a site can hand-build `/gb/london`, and one working page proves nothing about the subtree.
- **The two probe renders start together, and that is a latency rule, not a verdict rule.** The verdict still reads the probe first and returns it unless positive. Sequentially the promote path was three renders end to end at `RENDER_TIMEOUT_MS` each, and Cloudflare abandons an origin response at 100s — so "Verify now" answered a 524 on the very press that promoted a service, after the row was written. The cost is the control render on a host that fails the probe, where it used to be skipped: an enabled owner now spends three renders (mount, token, control), which is the budget #644 sets, and one where the mount verification failed.
- **Both URLs are derived from `canonical.embed` in one place** (`routingProbeUrls`), so an operator-typed string cannot reach the renderer by another route. A mount carrying a query string is a negative spending no render — `canonicalUrlBase` refuses that combination anyway.
- **The ladder is asymmetric, because the failures are.** A wrong `path` 404s every deep link and puts dead URLs in the sitemap. A wrong `query` only produces uglier URLs that work. So: promote on one positive, demote only after `ROUTING_PROBE_FAILURE_LIMIT` consecutive negatives.
- **Its own counter, never `failureCount`.** That one becomes `disable`, which switches canonical ownership off and emails the manager. A routing negative means the embed is present and publishing, so a shared counter would delete working public URLs over a URL-shape preference. `query` is a real canonical: the builder has a full arm for it, it is the default in both readers, and six `query` cases are pinned in `atlas-url-contract.json`.
- **The verdict survives a null `verified`**, which is why it sits beside it: a client should path-route as soon as its host serves the subtree, whether or not it is publishing canonical URLs yet.
- **"Verify now" may demote, where it may not disable.** Three presses return a client to `query` in a minute, with evidence — which is why there is no manual override field. The accepted cost: a host that serves the subtree but refuses headless renders (`bot-challenge`) stays on `query`, which is what it has today.
- **Nothing backfills the verdict**, so every service reads `query` until it is probed, including one publishing `path` canonicals before the deploy. Backfilling from the marker's `routing` would re-introduce the self-report this rule removes, and each existing embed is re-verified by hand anyway. The operator step is in [`DEPLOYMENT.md`](../../DEPLOYMENT.md#-post-deploy-step-re-verify-each-canonical-owning-client-644).

Vocabulary lives in `src/lib/clients/canonical.ts`, the verification contract in `src/lib/clients/verification.ts` — not the collection folder, since the job and the verifier both need it (`src/AGENTS.md` rule 4). `legacyConfig` was removed, not promoted: nothing backfills from it, since ownership now requires a verified reported embed.

### `embedMetadata` — what the widget observed

Admin-readonly JSON, keyed by **origin + pathname**, one record per mount (`mode`, `topLevel`, `urlWritable`, `paramPersisted`, `routing`, `lastSeen`). It stays a JSON column because nothing queries it — the ownership resolver loads every client (`pagination: false`, ~31 rows) and filters in memory. ⚠ Revisit if the client count grows an order of magnitude. A `jsonSchema` lets Payload generate the type and reject a malformed write.

**Canonical viability is automatic. Canonical *identity* is not.** A human designates which discovered mount is canonical. The metadata only decides whether that mount still qualifies. This bounds tampering: a forged report can assert viability only for a mount someone already chose, never invent one the verifier hasn't seen.

**The body is `origin` + `pathname`, two fields.** A query string or fragment is refused, since the endpoint can only enforce "path alone" that way — except a WordPress permalink (`?p=<digits>`), where discarding it would collapse the whole site onto one mount with no way to name the operator's intended page.

**The write is raw SQL, and has to be.** The other party is always another request — this route is unmetered, since `clients` is excluded from the plugin (below). Every *metered* read under the same client key increments `usage_daily_requests` on that row in autocommit, from the same pool Payload runs request transactions on, and a widget boot issues several on the same page load as the report. `payload.update` would hold the row for the life of the request transaction, so each of those blocks on `Lock: transactionid` while holding a connection that transaction may itself need. An autocommit `jsonb ||` merge has no transaction to hold the row in.

### `POST /api/clients/report`

The write path (`Clients/endpoints/report.ts`). Merges into the keyed object. It never replaces it. Since `clients` is excluded from the usage plugin, no `beforeOperation` hook fires here — the handler calls `assertClientOriginAllowed(req)` itself, right after `requireActiveClient`, and usage tracking likewise does not apply.

Two origin checks apply: the request's `Origin`/`Referer` must be in `allowedDomains`, and so must the reported `url`'s host — a client can only describe pages on domains it owns. `url` is origin plus pathname only. A query string or fragment is rejected (`400`, `query_or_fragment`), not stripped, since the widget already strips them and a payload carrying either means the widget is misbehaving.

Rate limiting is Cloudflare's, at the edge, as for every client route. On top of that, a repeat of a recent identical observation gets `updated: false` with **no read and no write** — the widget reports on every page load, so this path carries most of the traffic.
- **The cap bounds storage, never which mounts are knowable** (#639). `MAX_EMBED_MOUNTS` (50) caps what a forger can accumulate. A client at the cap still reports a new mount, evicting the least-recently-seen entry, so the held 50 reflect what is currently live. There is no 429 — refusing growth was tried first, and once ordinary traffic filled the budget an operator's intended page could never get reported. Two exceptions to eviction: the designated `canonical.embed` is never evicted, and the mount just reported can't be evicted by the write that reports it.

  `mergeEmbedReport` (`embedMetadata.ts`) computes the decision. The endpoint applies it in one statement — `|| $1::jsonb` merges, `- $2::text[]` deletes evicted keys. Both halves matter: `||` alone can't delete, so the column would grow unbounded while the cap stayed inert.
- Registered in the OpenAPI shim but stays `x-internal` (`docs/rules/openapi.md`).

Tests: `tests/unit/client-embed-metadata.spec.ts` (mount keys incl. `?p=`, the merge), `tests/unit/embed-verification.spec.ts` (marker parsing, error classification, failed/inconclusive), `tests/unit/canonical-embed-picker.spec.ts` (URL building, the three-strike ladder, picker options), `tests/int/client-canonical.int.spec.ts` (the hook, the endpoint, the job ladder, the cap, and that enabling ownership re-roots `webUrl` while `webPath` stays byte-identical).

## Per-region canonical `webUrl` (#634)

`webUrl` is not one global base. It resolves to the client owning the document's region, or the nearest owning ancestor, and falls back to the We Meditate surface when nothing in the ancestry is owned. `SAHAJATLAS_URL` is no longer a canonical base anywhere — it survives only in the two live-preview URLs.

| Piece | Where |
| --- | --- |
| The two URL shapes (`path` / `query`), and the cross-repo fixture | `src/lib/atlas/canonicalUrl.ts`, `atlas-url-contract.json` |
| Region tree + ancestor chains, one query per request | `src/lib/atlas/regionTree.ts` |
| Ownership: the `clients` read + nearest-ancestor walk | `src/lib/atlas/regionOwners.ts` |

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
- **Region paths are queryable** via `where[breadcrumbs.url][equals]='/nl/amsterdam'`, but this matches descendants too — add `slug` to resolve exactly one. Existing rows need `pnpm tsx scripts/backfill-region-breadcrumb-urls.ts` once.

## Mailing-list configuration on `clients`

A service that relays subscribe submissions names its own provider, under **Config → Mailing List**. Any service may run a list, whatever its roles.

⚠ **No API client can read any of it, at any depth.** Two things hold that up, and both are needed. The group carries `managersOnlyFieldAccess` (`@/plugins/access`), which closes the read `RESTRICTED_COLLECTIONS` never reaches — self-access hands a published key its own row whole over `GET /api/clients/me`. And `stripLockedFieldsOnSelfRead`, the `afterRead` hook `accessPlugin` gives every auth collection, closes `POST /api/clients/refresh-token`, which re-reads the row at `overrideAccess: true` and so skips field access entirely (#822). The group still appears in `payload-types.ts`; both strip it at runtime, not from the generated type.

**Credentials are checked when you save them**, by `validateMailingList`, which reads the named list and refuses the save with the provider's own words. Two bounds on that:

- It runs **only when `provider`, `listId` or `apiKey` actually changed.** `clients` runs `versions: { drafts: true, maxPerDoc: 1 }`, so the hook fires on every draft and autosave — without the gate, an outage at Mailchimp would lock every client document in the CMS.
- **A provider being unreachable never refuses a save.** An operator cannot fix somebody else's outage, so the credential goes in unproven and delivery is what finds out.

Delivery resolves the target list **at delivery time**, from the subscribe form's `client` or, for a registration-spawned row, the provenance client. Nothing is stored on the row, so moving a service between providers does not strip pending rows.

Each provider reports what it can actually justify: Mailchimp `subscribed` or `pending`, Brevo always `subscribed` (single opt-in only), Klaviyo always `accepted` — its subscribe job answers 202 with no per-profile result, so it can tell none of the three cases apart. ⚠ **An address that opted out is never re-added.** Mailchimp and Brevo each report it in their own words and the attempt is terminal, never retried; on Klaviyo the case cannot be detected inline, so the adapter uses the plain subscribe job and nothing that bypasses suppression.
