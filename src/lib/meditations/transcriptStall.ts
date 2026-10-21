/**
 * How long a processing transcript may stand before it counts as stalled.
 *
 * Far past any healthy run — it exists for a run lost to a restart, which
 * leaves the row in a running stage with nothing left to finish it.
 *
 * One consumer: the collection, which passes it to `jobStage.staleAfterMs`.
 * Both readers of the bound take it from there rather than from here — the
 * row's own Edit view on the server, and the Transcript tab from the client
 * config, where `admin.custom` carries the declaration as data. So this value
 * never has to be imported into the browser to be read there.
 */
export const TRANSCRIPTION_STALL_MS = 15 * 60 * 1000
