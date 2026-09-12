/**
 * The log levels `NEXT_PUBLIC_LOG_LEVEL` accepts, in order of verbosity.
 *
 * Deliberately **zod-free and outside the `@/lib/env` barrel**, for the same
 * reason `deploymentEnvironment.ts` is: `clientLogger` runs in the browser and
 * needs only this vocabulary.
 *
 * The load-bearing half is drift, not bytes: `ClientEnvSchema` builds its
 * `z.enum` from this list, so a level the logger honours and a level the server
 * accepts at boot cannot diverge. A local literal in `clientLogger` would be
 * smaller and would accept that divergence silently.
 *
 * The bundle half is an expectation, not a measurement — CI does not build this
 * app, so no chunk was inspected. What is checked: `./client` imports zod at
 * module scope, and nothing here marks `sideEffects: false`, so importing
 * `LOG_LEVELS` from there puts a zod-importing module in the logger's graph.
 * Today zod reaches the admin bundle anyway, by four other paths; #770 cuts one
 * of them, which is when this edge would start to matter.
 */
export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]
