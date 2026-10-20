/**
 * How long a processing transcript may stand before it counts as stalled.
 *
 * Far past any healthy run — it exists for a run lost to a restart, which
 * leaves the row `processing` with nothing left to finish it. The collection
 * passes it to `jobStage.staleAfterMs`, and the Transcript tab measures
 * `updatedAt` against it, so the row's Edit view and the tab go stale
 * together.
 *
 * Deliberately its own module, apart from `./transcript`, which builds zod
 * schemas at module scope. The tab is a `'use client'` component, so reaching
 * this bound through that module would ship zod to the browser to describe a
 * shape only the server validates — the same reason `framesBeyondDuration.ts`
 * sits apart from `./frames`, and `lib/env/logLevels.ts` outside its barrel.
 */
export const TRANSCRIPTION_STALL_MS = 15 * 60 * 1000
