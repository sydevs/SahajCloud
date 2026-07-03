# Deploying the App Preview to Production

How to put the live translation/app preview in front of translators on the
**prod** CMS (`cloud.sydevelopers.com`). Translators need **nothing** locally —
they open the prod admin, and the preview iframe loads a **hosted** build of the
app that renders their edits streamed over Payload live preview.

> The translation screens are **pure text**: the edited copy arrives via
> `postMessage` (cross-origin-safe, no CORS, no API key, no data fetch), and the
> app's bundled English (`assets/l10n/en_preview.json`) is the base. So the core
> feature needs only **deploy + one env var** — see Phase 1. The data-driven
> screens (Daily/Path/Meditation) are **Phase 2** (they fetch prod content).

Two repos ship:
- **WeMeditateApp** — branch `feat/cms-preview-engine`. The hosted preview page.
- **SahajCloud** (CMS) — branch `claude/nice-shtern-4fa2c0`. The `livePreview`
  wiring + translation-editor improvements.

---

## Phase 1 — translation preview (the core feature)

### 1. Build the preview page
From WeMeditateApp on `feat/cms-preview-engine`:
```bash
fvm flutter build web -t lib/main_app_preview.dart --release
# → build/web/  (static site: index.html + main.dart.js + assets/ + canvaskit/)
```
If hosting under a sub-path (e.g. `example.com/preview/`), add
`--base-href=/preview/`.

### 2. Host `build/web/` behind access control
Any static host works; **gate it** so only CMS users load it (it's an internal
tool). Recommended: **Cloudflare Pages** (or a Worker) + **Cloudflare Access**
restricting to the team's email domain / the same group that reaches the CMS.
Note the resulting URL, e.g. `https://wm-app-preview.pages.dev`.

- Decouple this from the mobile release train — it's just a web build of the same
  app, redeploy it whenever the app branch updates.
- No secrets are embedded for Phase 1 (translation screens don't call the API).

### 3. Point prod at it (one env var)
Set on the **prod CMS** (Railway service env), present **at build time**:
```
WEMEDITATE_APP_URL = https://wm-app-preview.pages.dev
```
- `admin.livePreview.url` (via `appLivePreview()`) reads it → the iframe becomes
  `${WEMEDITATE_APP_URL}/?global=wm-app-translations&locale=<code>&secret=<…>`.
- `next.config.mjs` builds the CSP `frame-src` **from** `WEMEDITATE_APP_URL`
  (line ~52), so the frame is auto-allowed — **no code change**. It must be set
  before the CMS builds (Railway bakes `headers()` at build time), so redeploy
  the CMS after setting it.

### 4. Ship the CMS branch
Merge `claude/nice-shtern-4fa2c0` → `main` (open the PR) and deploy. It carries:
- `livePreview` wiring on the app collections + `wm-app-translations`
- the tab-follow `ScreenBeacon` (targets `?global=wm-app-translations`)
- translation-editor UX: placeholder shows the English reference, taller inputs,
  526 simplified field descriptions.

**Migration:** drafts were enabled on **Lessons + Lectures**, autosave added to
**App Cards**, and **Meditations `livePreview` repointed** to the app. Locally
these auto-synced via `push`; prod needs a Payload migration — create it
(`pnpm db:migrations:create`), commit, it auto-applies on deploy. See
`.claude/rules/migrations.md`.

### 5. Verify (on prod)
`cloud.sydevelopers.com/admin` → **Translations** → eye icon → switch locale →
type a value → the app screen updates live. The tab bar (Onboarding/Auth/…)
switches the previewed screen; screens with no app view show a clear notice.

**Covered in Phase 1:** Welcome, Name, Greeting, User type, Login, Explore,
Contact (pure-text screens driven entirely by the live-preview stream).

---

## Phase 2 — data-driven screens (Daily / Path / Meditation, "see all app cards")

These render real content (cards, lessons, meditations) the translator's edits
sit inside, so the hosted page must **fetch prod content**. In prod that data
already exists — two things are needed:

1. **CORS**: allow the preview origin (`WEMEDITATE_APP_URL`) in the prod Payload
   `cors` config so the browser build may read `/api/*`. (The native mobile app
   isn't subject to CORS; the web build is.)
2. **API auth without exposing the key**: don't embed `WM_PAYLOAD_CMS_API_KEY`
   in the public bundle. Serve reads through a **GET-only** proxy (a CMS route
   that injects the key server-side) or a scoped read-only key behind Access.
3. **Screen instantiation**: Daily/Home/full-Path are built to run inside the
   app's router + cubits; rendering them standalone in the preview host is
   additional work (the collection previews — Meditations/Lectures/Path Steps/
   App Cards — already instantiate cleanly and only need the data).

Also optional: a **mock signed-in state** (stubbed `AuthAuthenticated` + a
placeholder user, scoped to `main_app_preview.dart`) so the logged-in Profile
screens render for translation — no Firebase needed.

---

## Notes
- `SAHAJCLOUD_PREVIEW_SECRET` appears in the iframe URL but is unused by the
  Phase-1 text screens (they don't read drafts via the API); it matters for
  Phase 2 gated reads.
- Redeploy cadence: the CMS on merge; the hosted preview page whenever the app
  branch changes (independent of the mobile app store release).
