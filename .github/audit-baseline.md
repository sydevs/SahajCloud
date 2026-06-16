# Dependency-audit baseline

CI runs `pnpm audit --audit-level=high` as the **Audit dependencies** job in
[`ci.yml`](./workflows/ci.yml) on every pull request. **High** and **Critical**
advisories fail the check; **Moderate**/**Low** are reported but do not. The job
reads the committed `pnpm-lock.yaml`, `package.json`, and `pnpm-workspace.yaml`
(the `ignoreGhsas` config) directly — it runs **no `pnpm install`**. Reproduce
locally with `pnpm audit` (the `audit` script).

## How suppression works

`pnpm audit` has no "new advisories only" mode, so the High/Critical advisories
that already existed when this gate was introduced are baselined in
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) under **`auditConfig.ignoreGhsas`**
(pnpm 10+ reads pnpm settings here, not from the package.json `pnpm` field). A
_new_ advisory — any GHSA not in that list — still fails CI. That is the point
of the gate: it catches vulnerabilities that enter `pnpm-lock.yaml` from here on.

Every GHSA in `ignoreGhsas` **must** have a row below (reason + link). The YAML
lists only the ids, so this file is the authoritative reason log.

- **To suppress a new advisory:** add its `GHSA-…` id to `ignoreGhsas`, add a row
  here with the reason and the advisory link, and note when to revisit it. Never
  add an id without a documented reason.
- **To stop suppressing** (after an upstream fix): bump the dependency so the
  patched version resolves, drop the GHSA from `ignoreGhsas`, and delete its row
  here.

## Why these are baselined rather than fixed

Every entry below is a transitive dependency of **dev / test / build tooling**
or of the **`aws-crt`** native AWS runtime. None of them executes in the deployed
Cloudflare Worker bundle (produced by OpenNext — app + Payload runtime only), and
none is reachable through attacker-controlled input in how we use it (the
ReDoS / path-traversal vectors are fed by our own config globs, schemas, and
build inputs). The proper long-term fix is upstream upgrades; that is tracked
separately so this PR stays a focused CI-gate addition. The one advisory with an
in-range patch — `tmp` ([GHSA-ph9p-34f9-6g65](https://github.com/advisories/GHSA-ph9p-34f9-6g65))
— was fixed by bumping `tmp` to `^0.2.7` rather than ignored.

## Baseline (introduced in #465)

### `axios` via `aws-crt` — native AWS runtime, not in the Worker

All paths are `aws-crt > axios` (pinned `1.13.2`; patched `>=1.16.0`). `aws-crt`
is the AWS Common Runtime native addon; its `axios` HTTP client is not bundled or
executed in the Cloudflare Worker, and the proxy / SSRF / prototype-pollution
gadgets require server-side HTTP calls we don't make through it. Clear by bumping
`aws-crt` to a release that ships `axios>=1.16.0`, or via a pnpm `overrides` entry.

| GHSA                                                                                      | Advisory                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [GHSA-pmwg-cvhr-8vh7](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7) (CVE-2026-42043) | NO_PROXY bypass via 127.0.0.0/8 loopback subnet                |
| [GHSA-pf86-5x62-jrwf](https://github.com/advisories/GHSA-pf86-5x62-jrwf) (CVE-2026-42033) | Prototype-pollution gadgets: response tampering / exfiltration |
| [GHSA-6chq-wfr3-2hj9](https://github.com/advisories/GHSA-6chq-wfr3-2hj9) (CVE-2026-42035) | Header injection via prototype pollution                       |
| [GHSA-43fc-jf86-j433](https://github.com/advisories/GHSA-43fc-jf86-j433) (CVE-2026-25639) | DoS via `__proto__` key in `mergeConfig`                       |
| [GHSA-q8qp-cvcw-x6jj](https://github.com/advisories/GHSA-q8qp-cvcw-x6jj) (CVE-2026-42264) | Prototype-pollution read-side gadgets in HTTP adapter          |
| [GHSA-pjwm-pj3p-43mv](https://github.com/advisories/GHSA-pjwm-pj3p-43mv) (CVE-2026-44492) | NO_PROXY bypass via IPv4-mapped IPv6 addresses                 |
| [GHSA-3g43-6gmg-66jw](https://github.com/advisories/GHSA-3g43-6gmg-66jw) (CVE-2026-44495) | Credential theft / response hijacking via config-merge gadget  |
| [GHSA-35jp-ww65-95wh](https://github.com/advisories/GHSA-35jp-ww65-95wh) (CVE-2026-44494) | Full MITM via prototype-pollution gadget in `config.proxy`     |
| [GHSA-hfxv-24rg-xrqf](https://github.com/advisories/GHSA-hfxv-24rg-xrqf) (CVE-2026-44496) | ReDoS via cookie-name injection                                |
| [GHSA-777c-7fjr-54vf](https://github.com/advisories/GHSA-777c-7fjr-54vf) (CVE-2026-44488) | Allocation of resources without limits/throttling              |
| [GHSA-p92q-9vqr-4j8v](https://github.com/advisories/GHSA-p92q-9vqr-4j8v) (CVE-2026-44487) | Proxy-Authorization credential leak across HTTP→HTTPS redirect |
| [GHSA-j5f8-grm9-p9fc](https://github.com/advisories/GHSA-j5f8-grm9-p9fc) (CVE-2026-44486) | Proxy-Authorization header leak to redirect target             |

### Build-time glob / route matching — `minimatch`, `picomatch`, `path-to-regexp`

ReDoS reachable only through glob/route patterns evaluated at **build/dev/lint
time** on inputs we control (our own config globs and routes), never on
attacker-supplied strings in the Worker.

| GHSA                                                                                      | Package · path                                                      | Advisory                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) (CVE-2026-26996) | `minimatch` via `@opennextjs/cloudflare > … > glob` (bundler)       | ReDoS: repeated wildcards          |
| [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) (CVE-2026-27903) | `minimatch` via `@opennextjs/cloudflare > … > glob`                 | ReDoS: GLOBSTAR backtracking       |
| [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) (CVE-2026-27904) | `minimatch` via `@opennextjs/cloudflare > … > glob`                 | ReDoS: nested extglobs             |
| [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) (CVE-2026-33671) | `picomatch` via `vite` (test transform)                             | ReDoS via extglob quantifiers      |
| [GHSA-j3q9-mxjg-w52f](https://github.com/advisories/GHSA-j3q9-mxjg-w52f) (CVE-2026-4926)  | `path-to-regexp` via `@opennextjs/cloudflare > … > express` (build) | DoS via sequential optional groups |

### Payload type-gen / `ajv` build deps — `lodash`, `fast-uri`

Used at **build / type-generation / schema-validation time** on our own JSON
schemas, not on runtime user input.

| GHSA                                                                                     | Package · path                                     | Advisory                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) (CVE-2026-4800) | `lodash` via `payload > json-schema-to-typescript` | Code injection via `_.template`               |
| [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6) (CVE-2026-6321) | `fast-uri` via `payload > ajv`                     | Path traversal via percent-encoded dots       |
| [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc) (CVE-2026-6322) | `fast-uri` via `payload > ajv`                     | Host confusion via percent-encoded delimiters |

### Vite / Sass / ESLint toolchain — `vite`, `immutable`, `flatted`

Dev/test/lint tooling. The Vite **dev server** is never run (we use only Vitest's
transform); `sass`/`eslint` operate on our own sources at build/lint time.

| GHSA                                                                                      | Package · path                                         | Advisory                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) (CVE-2026-39363) | `vite` via `@vitejs/plugin-react`                      | Arbitrary file read via dev-server WebSocket |
| [GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r) (CVE-2026-39364) | `vite` via `@vitejs/plugin-react`                      | `server.fs.deny` bypassed with queries       |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)                   | `vite` via `@vitejs/plugin-react` + `vitest`           | `server.fs.deny` bypass on Windows alt paths |
| [GHSA-wf6x-7x77-mvgw](https://github.com/advisories/GHSA-wf6x-7x77-mvgw) (CVE-2026-29063) | `immutable` via `vite > sass`                          | Prototype pollution                          |
| [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f) (CVE-2026-32141) | `flatted` via `eslint > file-entry-cache > flat-cache` | Unbounded-recursion DoS in `parse()`         |
| [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) (CVE-2026-33228) | `flatted` via `eslint > file-entry-cache > flat-cache` | Prototype pollution via `parse()`            |

### esbuild — dev/build bundler (`tsx`, `vite`)

Build/test-only. `esbuild` is pulled transitively by `tsx` (running our `.ts`
scripts) and Vitest's `vite` transform; it never runs in the deployed Worker
bundle. The advisory's RCE vector requires a Deno install pointed at an
attacker-controlled `NPM_CONFIG_REGISTRY` — not how our CI/dev installs run.
Revisit once `tsx`/`payload` resolve `esbuild >=0.28.1` (a forced override is
not honoured from `pnpm-workspace.yaml` on pnpm 11.5.2, so this is baselined
rather than pinned).

| GHSA                                                                                      | Package · path                       | Advisory                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| [GHSA-gv7w-rqvm-qjhr](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) | `esbuild` via `payload > tsx` (build) | Missing binary integrity verification (Deno) → RCE |

### `ws` — WebSocket lib in dev/test transitive paths only

`ws <8.21.0` (memory-exhaustion DoS from tiny fragments). Every path is
dev/test/build-only and not reachable in the deployed runtime: `@payloadcms/
db-postgres > … > @libsql/… > ws` is the SQLite driver, **unused** on this
Postgres deployment, and `react-email > socket.io > ws` is React Email's local
preview server, not the rendered-email output. No WebSocket fed by
attacker-controlled traffic runs in production. Clear by bumping the transitive
`ws` to `>=8.21.0` once the intermediate deps allow it.

| GHSA                                                                                      | Package · path                                                        | Advisory                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | `ws` via `@payloadcms/db-postgres > … > @libsql` (unused) + `react-email` (dev) | Memory-exhaustion DoS from tiny fragments |
