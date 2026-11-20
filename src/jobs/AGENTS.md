# Scheduled Jobs

Payload's `autoRun` job system runs background tasks in the same long-lived Node process on Railway — no separate workers.

⚠ **A `schedule` is dead without an `autoRun` entry for its own queue.** Payload calls `handleSchedules({ queue })` only from that queue's `autoRun` cron, so a schedule on a queue nothing ticks is never consulted — no error, no log line, no job row. The `monthly` queue was in that state from the day it was introduced until #878, so neither job on it had ever run anywhere. The pairing, and the one deliberate exception, live in `src/jobs/queues.ts`; `tests/unit/job-schedules.spec.ts` fails on the next dead schedule.

⚠ **A `payload.jobs.queue` call picks a queue the same way, and nothing drives `default`.** A row enqueued onto a queue with no `autoRun` entry — including the one an omitted `queue:` key chooses — is written for real and then waits forever, as silently as a dead schedule. The same spec reads every `jobs.queue(` call under `src/`, which is why an enqueue site names its queue with a string literal: a constant reads as no queue at all.

⚠ **A Railway PR preview has no `autoRun` at all** (`jobAutoRun()` in `src/jobs/queues.ts`). Every tick queries the database, which kept every idle preview's app and Postgres awake and billed around the clock — most of the Railway bill in Oct–Nov 2026. A queue a write kicks through `runQueueSoon` still runs there; a schedule never fires and a lost kick is never retried. To exercise a scheduled job on a preview, sign in and open `/api/payload-jobs/run?queue=<queue>`, which enqueues what is due and runs it.

Each job's schedule, queue and limits are on its own task definition and in `src/jobs/queues.ts`.
What follows is only what a job's code cannot say for itself.

- **`CleanupOrphanedMedia`** trashes newly-orphaned files and images, found by schema introspection
  rather than a hardcoded list. Phase A then permanently deletes trashed items past
  `TRASH_RETENTION_DAYS` **that nothing references any more**, so what one run trashes survives the
  next run; that phase had no age check at all while the queue was dead (#878), and age was still
  its whole test until #1118. ⚠ The retention must stay longer than 31 days: at 30, a run after any
  31-day month deleted the previous run's trash. And the scan window must stay a span, not a band
  chosen by `month % 3` — that is how 8 months of uploads in 12 were never scanned at all. ⚠ Review
  a run against real data with the `dryRun` input from the admin Jobs UI before trusting a new
  window or threshold: it counts and logs both phases and writes nothing.
- **`SyncLectureMetadata`** — to run one now, queue it from the admin Jobs UI: `jobs:run --queue
monthly` only drains a row already past its `waitUntil`.
- **`ExpireEvents`** — a schedule that ran out gets `verificationStage: 'finished'` without
  unpublishing (#603, so an old link keeps resolving); the public feeds filter it via
  `schedule.lastDate` instead. Which moves the verification ladder has, and who may make each, is
  `EVENT_MACHINE` (`src/lib/eventVerification/machine.ts`). A stage advances only once every
  recipient's email is logged, so a failed send retries. `EVENT_VERIFICATION_ENABLED=false` pauses
  the whole sweep before it queries.
  ⚠ **Its bookkeeping writes skip document validation** (#835). Payload re-validates the whole
  document on update, so an event whose _stored_ data fails a validator added after that row was
  written could never be advanced, finished or logged, and its reminder went out again every
  night. `updateEventWithoutValidation` (`src/lib/events/`) skips validation while still writing the
  main row and the `latest: true` version row together. A tightened Events validator therefore no
  longer strands existing rows — but it also no longer stops these writes.
  ⚠ **That helper is shared, and what it excludes is the point** (#842). The `registrationsFull`
  sync and the community-feedback tallies write through it too: both run in unguarded
  `afterChange` hooks, so a refused Events write killed a visitor's registration or vote outright.
  **Verifying an event deliberately does not** — broken data is fixed before an event is verified,
  so `applyVerification` still validates and both verify surfaces report the failure. A write
  applying editor-supplied content never comes through here either.
- **`SendDigests`** (#1070) — one email per manager **per role**, carrying only the sections whose
  own notification pace is due that morning. ⚠ **One schedule, not three.** Daily, Weekly and
  Monthly are decided from the run's own clock (`PACES` in `src/jobs/Digests/buildDigest.ts`),
  because three schedules would send three emails to one manager on a Monday the 1st. A "new
  since" section reads from `Managers.digestWatermarks`, which the run advances per role and key —
  so a retry re-sends nothing.
- **`RecordAtlasSnapshot`** — the only history a stage count has, since the stage is overwritten in
  place on the event, so it is what a dashboard tile's "+X in 30 days" line compares against. ⚠ **A
  tile shows no change line at all with no snapshot that old**, never "+0": a freshly deployed
  environment knows nothing about 30 days ago.
- **Submissions** (`user-submissions`, #632, #723, #724) — the POST persists and returns at once.
  `screenSubmission` queues delivery **only** on a clean verdict, which is why a refused row never
  reaches a recipient, a provider or a manager. Retention on contact rows must stay longer than
  the history the screening checks read. The `users` orphan sweep never deletes a sender an admin
  has blocked: a block is a decision (#630).
  ⚠ **A machine refusal is `status: 'spam'`; `rejected` is a manager's decline.** Two statuses, so
  abuse counting and retention both read the indexed column and neither counts a manager's
  judgement as a spam strike against the person who wrote in. `confirmed_spam` is an admin settling
  a machine refusal, and counts as a strike for the same reason `spam` does — it agrees with the
  machine rather than overruling it, and only an admin may set it or release the row back to
  `pending` (#1070). `screeningResult.verdict` says which check refused, for the reader — never
  whether one did. The split is also what lets retention reach a `spam` registration or
  subscription while keeping every decided one for ever: a refused sign-up records neither an
  attendance nor a consent.
- **CSV class import** — `importEvents` (#907, `src/plugins/eventImport/task.ts`), queued by the
  upload and kicked at once by `runQueueSoon`. Each row becomes one draft class, created as the
  uploader in its own transaction.
- **`TranscribeRecording`** — its slug stays `transcribeMeditation` because it is a Postgres enum
  value. **Every request is this queued job**, including the re-request endpoints (#984, #1016),
  which replace the transcript row for the task to fill. `retries: 0`, so a failure throws and the
  retained job row carries the message — which is where the row's virtual `status` and `error` are
  read from. The glossary's own spellings go to the vendor as the `prompt` whenever the language is
  known, which is what stops it writing an IAST variant (#1084). ⚠ **It never writes the
  meditation** (#897): `meditations` keeps three versions behind drafts, so a write there would burn
  one and could publish an editor's unfinished draft. ⚠ **It has no `concurrency` key, on
  purpose** — Payload holds back any job whose key matches one still marked `processing`, and a run
  lost to a restart keeps that flag forever, which would block a re-request after a stall for good.
- **`CleanupCollections`** — how a collection joins retention is in `src/AGENTS.md`. ⚠ **The
  `payload-jobs` window (`JOB_RETENTION_DAYS`) is the other half of `deleteJobOnComplete: false`.**
  A finished job row is what a transcript derives its status from, so Payload may no longer drop
  one the moment its run ends — and nothing else bounds `payload-jobs`. A queued row is never
  swept: it is old because its `waitUntil` has not arrived, and deleting it would cancel work
  nobody asked to cancel. The flag is global, so this covers every queue. `transcripts` declares no
  window (#1043): a cascade from each parent takes the row before the parent goes.
- **`RecoverLostJobs`** (#1117) — a container that dies mid-job leaves its row `processing` for
  ever: Payload never recovers one, and while it stands the task's schedule queues no other. The
  sweep cancels every row older than `STALE_JOB_MS` — age is the one discriminator, because running
  is not proof the owner died (a rolling deploy sweeps while the old container works) — then
  settles the documents those runs owned, which cancelling alone does not do. ⚠ **It carries a
  `beforeSchedule` hook of its own**, because the sweep is the only thing that settles a lost row,
  and a sweep lost mid-run would otherwise hold its own schedule for ever.
- **Usage tracking** — see `docs/rules/api-clients.md`.
