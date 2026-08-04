/**
 * No-op migration — it exists only to refresh the schema-snapshot chain.
 *
 * origin/main's highest-timestamp snapshot
 * (20260803_221051_registrations_full_flag.json) merged in from PR #601, which
 * generated it before #605/#608's schema landed: region level `venue`, events
 * `contact_email` / `address_venue_name`, and the translations `event_title`
 * column. Those migrations are timestamped earlier than 0803 but merged later,
 * so 0803's snapshot was stale and migrate:create re-emitted their
 * already-applied DDL. That DDL is dropped here — every change is applied by an
 * earlier migration in the chain — and only the regenerated, now-cumulative
 * .json snapshot is kept, so the next migrate:create diffs from the true current
 * schema. See the "out-of-order snapshot trap" in .claude/rules/migrations.md.
 */
export async function up(): Promise<void> {}

export async function down(): Promise<void> {}
