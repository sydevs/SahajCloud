#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Seed Launch Readiness Dashboard
 *
 * Populates the DB with partial data so every section of the wm-app-status
 * dashboard shows both passing and failing checks — exercising the UI in all
 * states (colored badges, mixed document table rows, aggregate counts).
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-launch-readiness.ts
 *
 * Prerequisites:
 *   pnpm seed tags        → creates 24 user-choices
 *   pnpm seed meditations → creates 73 meditations
 *
 * Idempotent: re-running appends duplicate data. Run against a fresh DB.
 */

import { sql } from '@payloadcms/db-d1-sqlite/drizzle'
import type { Payload } from 'payload'

import { VIBE_CHECK_IDENTIFIERS } from '../src/globals/wemeditate-app/config'

// ============================================================================
// Helpers
// ============================================================================

function minimalLexicalContent(text: string) {
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          children: [
            { type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' },
          ],
        },
      ],
    },
  }
}

function getDb(payload: Payload) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (payload.db as any).drizzle
}

async function insertAndGetId(
  payload: Payload,
  statement: ReturnType<typeof sql>,
  idTable: string,
): Promise<number> {
  const db = getDb(payload)
  await db.run(statement)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = await db.get(sql`SELECT id FROM ${sql.raw(idTable)} ORDER BY id DESC LIMIT 1`)
  return row.id as number
}

// ============================================================================
// Step 1: Create 2 stub file records (direct SQL — bypass upload hooks/R2)
// ============================================================================

async function createStubFiles(payload: Payload) {
  console.log('\nStep 1: Creating stub file records...')
  const db = getDb(payload)

  await db.run(sql`INSERT INTO files DEFAULT VALUES`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioRow: any = await db.get(sql`SELECT id FROM files ORDER BY id DESC LIMIT 1`)
  const audioFileId = audioRow.id as number
  await db.run(
    sql`UPDATE files SET filename = 'stub-vibe-check-audio.mp3', mime_type = 'audio/mpeg' WHERE id = ${audioFileId}`,
  )

  await db.run(sql`INSERT INTO files DEFAULT VALUES`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtitleRow: any = await db.get(sql`SELECT id FROM files ORDER BY id DESC LIMIT 1`)
  const subtitleFileId = subtitleRow.id as number
  await db.run(
    sql`UPDATE files SET filename = 'stub-vibe-check-subtitles.vtt', mime_type = 'text/vtt' WHERE id = ${subtitleFileId}`,
  )

  console.log(`  Audio stub file ID:    ${audioFileId}`)
  console.log(`  Subtitle stub file ID: ${subtitleFileId}`)
  return { audioFileId: audioFileId as number, subtitleFileId: subtitleFileId as number }
}

// ============================================================================
// Step 2: Create baseline audience
// ============================================================================

async function createAudience(payload: Payload) {
  console.log('\nStep 2: Creating baseline audience (no restrictions → matches all users)...')
  const audience = await payload.create({
    collection: 'audiences',
    overrideAccess: true,
    data: { label: 'All Users (Launch Readiness Seed)' },
  })
  console.log(`  Audience ID: ${audience.id}`)
  return audience.id as number
}

// ============================================================================
// Step 3: Create 12 synthetic lectures (direct SQL — bypass NV API hooks)
// ============================================================================

async function createLectures(payload: Payload, audienceId: number) {
  console.log('\nStep 3: Creating 12 synthetic lectures (5 priority, 7 default)...')
  const db = getDb(payload)
  const lectureIds: number[] = []

  for (let i = 0; i < 12; i++) {
    const priority = i < 5 ? 1 : 0

    // Main row
    await db.run(sql`INSERT INTO lectures (type, priority) VALUES ('full', ${priority})`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lectureRow: any = await db.get(sql`SELECT id FROM lectures ORDER BY id DESC LIMIT 1`)
    const lectureId = lectureRow.id as number

    // Localized title
    await db.run(
      sql`INSERT INTO lectures_locales (title, _locale, _parent_id) VALUES (${'Seed Lecture ' + (i + 1)}, 'en', ${lectureId})`,
    )

    // Audience relationship (enables baseline-audience check)
    await db.run(
      sql`INSERT INTO lectures_rels ("order", parent_id, path, audiences_id) VALUES (1, ${lectureId}, 'audiences', ${audienceId})`,
    )

    lectureIds.push(lectureId as number)
  }

  console.log(
    `  Created lecture IDs: ${lectureIds.join(', ')} (first 5 have priority=1, rest priority=0)`,
  )
  return lectureIds
}

// ============================================================================
// Step 4: Create 14 stub core pages (all published + content → group fully passes)
// ============================================================================

const CORE_PAGE_FIELDS = [
  'classesPage',
  'liveMeditationsPage',
  'explorePage',
  'exploreDeeperPage',
  'meditateTogetherPage',
  'techniquesPage',
  'lecturesPage',
  'lessonsPage',
  'musicPage',
  'shriMatajiPage',
  'sahajaYogaPage',
  'subtleSystemPage',
  'privacyPage',
  'termsPage',
] as const

async function createCorePages(payload: Payload) {
  console.log('\nStep 4: Creating 14 core pages (published + content → all pass)...')
  const corePageIds: Record<string, number> = {}

  for (const fieldName of CORE_PAGE_FIELDS) {
    const page = await payload.create({
      collection: 'pages',
      locale: 'en',
      overrideAccess: true,
      data: {
        title: fieldName,
        slug: `seed-lr-${fieldName.toLowerCase()}`,
        content: minimalLexicalContent(`App page: ${fieldName}`),
        _status: 'published',
      },
    })
    corePageIds[fieldName] = page.id as number
  }

  console.log(`  Created page IDs: ${Object.values(corePageIds).join(', ')}`)
  return corePageIds
}

// ============================================================================
// Step 5: Add content to 6 of 12 subtle-system pages
//   Pages 1–6: published ✓ + content ✓  (both checks pass)
//   Pages 7–12: published ✓ + no content ✗  (content-localized fails)
// ============================================================================

async function seedSubtleSystemPages(payload: Payload) {
  console.log('\nStep 5: Adding content to subtle-system pages 1–6 (7–12 left empty)...')
  const labels = ['Mooladhara', 'Swadhistan', 'Nabhi', 'Void', 'Anahat', 'Vishuddhi']

  for (let id = 1; id <= 6; id++) {
    await payload.update({
      collection: 'pages',
      id,
      locale: 'en',
      overrideAccess: true,
      data: { content: minimalLexicalContent(`${labels[id - 1]} — an energy center.`) },
    })
  }
  console.log('  Done. Pages 7–12 intentionally left with empty content.')
}

// ============================================================================
// Step 6: Create 4 app cards — one per distinct check-state combination
//   lc1:  ✓✓✓✓  published + title + subtitle + buttonText
//   lc2:  ✓✓✗✓  published + title + NO subtitle + buttonText
//   opt1: ✓✓✓✗  published + title + subtitle + NO buttonText
//   opt2: ✗✓✗✗  draft     + title + NO subtitle + NO buttonText
// ============================================================================

async function createAppCards(payload: Payload) {
  console.log('\nStep 6: Creating 4 app cards (one per check-state combination)...')

  // Default view requires aspectRatio, textColor, alignment (all have DB defaults).
  // Casting data as `any` — this is a seed script and the generated types for
  // versioned collections are stricter than the actual runtime accepts.
  const defaultBase = { aspectRatio: 'square', textColor: 'black', alignment: 'center' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createCard = (data: Record<string, unknown>) =>
    (payload.create as (opts: unknown) => Promise<{ id: unknown }>)({
      collection: 'app-cards',
      overrideAccess: true,
      data,
    })

  const lc1 = await createCard({
    label: 'Meditation of the Day',
    type: 'standard',
    default: {
      ...defaultBase,
      title: 'Meditation of the Day',
      subtitle: 'Your daily practice',
      buttonText: 'Begin',
    },
    _status: 'published',
  })

  // lc2: empty subtitle → subtitle-set fails
  const lc2 = await createCard({
    label: 'Daily Lecture',
    type: 'standard',
    default: { ...defaultBase, title: 'Daily Lecture', subtitle: '', buttonText: 'Watch' },
    _status: 'published',
  })

  // opt1: empty buttonText → button-label-set fails
  const opt1 = await createCard({
    label: 'Morning Session',
    type: 'standard',
    default: {
      ...defaultBase,
      title: 'Morning Session',
      subtitle: 'Start your day',
      buttonText: '',
    },
    _status: 'published',
  })

  // opt2: draft + no subtitle/buttonText → published ✗, subtitle ✗, button ✗
  const opt2 = await createCard({
    label: 'Coming Soon',
    type: 'standard',
    default: { ...defaultBase, title: 'Coming Soon' },
    _status: 'draft',
  })

  console.log(
    `  lc1 ✓✓✓✓ ID=${lc1.id}  lc2 ✓✓✗✓ ID=${lc2.id}  opt1 ✓✓✓✗ ID=${opt1.id}  opt2 ✗✓✗✗ ID=${opt2.id}`,
  )
  return { lc1Id: lc1.id as number, lc2Id: lc2.id as number }
}

// ============================================================================
// Step 7: Update user choices + link first 12 to lectures
//   Timings set: morning ✓ + evening ✓   (afternoon ✗ + night ✗ left empty)
//   Lectures linked to user choices 0–11; choices 12–23 get no lecture
// ============================================================================

async function updateUserChoices(payload: Payload, lectureIds: number[]) {
  console.log('\nStep 7: Updating user choices (morning + evening only) and linking lectures...')
  const db = getDb(payload)

  const { docs: choices } = await payload.find({
    collection: 'user-choices',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  console.log(`  Found ${choices.length} user choices`)

  // filterOptions on meditation fields requires type: quick or daily — pre-load valid IDs
  const { docs: validMeditations } = await payload.find({
    collection: 'meditations',
    where: { type: { in: ['quick', 'daily'] } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const validMedIds = validMeditations.map((m) => m.id as number)
  console.log(`  ${validMedIds.length} quick/daily meditations available for assignment`)

  let medIdx = 0
  for (const choice of choices) {
    const timings =
      ((choice as unknown as Record<string, unknown>).timings as string[] | undefined) ?? []
    // Include existing timings so admin.condition evaluates correctly server-side
    const data: Record<string, unknown> = { timings }
    if (timings.includes('morning'))
      data.morningMeditation = validMedIds[medIdx++ % validMedIds.length]
    if (timings.includes('evening'))
      data.eveningMeditation = validMedIds[medIdx++ % validMedIds.length]
    // afternoon + night intentionally left null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await payload.update({
      collection: 'user-choices',
      id: choice.id,
      locale: 'en',
      overrideAccess: true,
      data: data as any,
    })
  }

  // Link lectures 0–11 to user choices 0–11 via direct SQL
  for (let i = 0; i < 12 && i < lectureIds.length && i < choices.length; i++) {
    await db.run(
      sql`INSERT INTO lectures_rels ("order", parent_id, path, user_choices_id) VALUES (1, ${lectureIds[i]}, 'userChoices', ${choices[i].id})`,
    )
  }
  console.log(`  Meditation assignments done (morning + evening). Lectures linked to choices 0–11.`)
}

// ============================================================================
// Step 8a: Update wm-app-config via Payload API
//   - selfRealizationMeditation: set (both checks ✓)
//   - postRealizationLecture: intentionally left unset (check ✗)
//   - vibeCheckTracks: 3 fully configured tracks (present ✓ audio ✓ subtitles ✓)
//   - All 14 core page fields
// ============================================================================

async function updateAppConfig(
  payload: Payload,
  corePageIds: Record<string, number>,
  audioFileId: number,
  subtitleFileId: number,
) {
  console.log('\nStep 8a: Updating wm-app-config (3 fully-configured vibe-check tracks)...')

  await payload.updateGlobal({
    slug: 'wm-app-config',
    locale: 'en',
    overrideAccess: true,
    data: {
      selfRealizationMeditation: 1, // meditation 1 has locale='en' → both checks ✓
      // postRealizationLecture left unset → relationship-set ✗

      // Tracks 0–4: fully configured (5 rows all-pass, 3 absent rows all-fail)
      // D1 FK enforcement prevents the phantom-subtitles approach for mixed-column rows;
      // mixed-column states are shown by app cards, user choices, and pages instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vibeCheckTracks: (VIBE_CHECK_IDENTIFIERS as Array<{ value: string }>)
        .slice(0, 5)
        .map(({ value }) => ({
          identifier: value,
          audio: audioFileId,
          subtitles: subtitleFileId,
        })) as any,

      ...corePageIds,
    },
  })

  console.log('  selfRealizationMeditation set. Tracks 0–4 configured (5 pass, 3 absent → fail).')
}

// ============================================================================
// Step 8b: Insert 3 audio-only vibe-check tracks via direct SQL
//   subtitles required=true in Payload schema → can't save without one via API.
//   Use subtitles_id=9999999 (satisfies NOT NULL; resolves to null at depth=2
//   since no file with that ID exists → subtitles-set check fails).
// ============================================================================

async function insertPartialVibeCheckTracks(payload: Payload, audioFileId: number) {
  console.log('\nStep 8b: Inserting 3 audio-only vibe-check tracks (subtitles_id → phantom ID)...')
  const db = getDb(payload)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configRow: any = await db.get(sql`SELECT id FROM wm_app_config LIMIT 1`)
  const configParentId = configRow.id as number

  // Tracks 3–5: present ✓, audio-set ✓, subtitles-set ✗
  for (let i = 3; i < 6; i++) {
    const { value: identifier } = (VIBE_CHECK_IDENTIFIERS as Array<{ value: string }>)[i]
    await db.run(sql`
      INSERT INTO wm_app_config_vibe_check_tracks
        (_order, _parent_id, _locale, id, identifier, audio_id, subtitles_id)
      VALUES
        (${i + 1}, ${configParentId}, 'en', ${'seed-vbc-' + i}, ${identifier}, ${audioFileId}, 9999999)
    `)
    console.log(`  Track ${i} (${identifier}): audio ✓  subtitles ✗`)
  }
  // Tracks 6–7 never inserted → present ✗, audio-set ✗, subtitles-set ✗
  console.log('  Tracks 6–7 absent → all checks fail for those rows.')
}

// ============================================================================
// Step 9: Set launchCriticalAppCards on wm-app-status
// ============================================================================

async function setLaunchCriticalCards(payload: Payload, lc1Id: number, lc2Id: number) {
  console.log('\nStep 9: Setting launch-critical app cards on wm-app-status...')
  await payload.updateGlobal({
    slug: 'wm-app-status',
    overrideAccess: true,
    data: { launchCriticalAppCards: [lc1Id, lc2Id] },
  })
  console.log(`  Launch-critical card IDs: ${lc1Id}, ${lc2Id}`)
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  let payload: Payload | null = null

  try {
    console.log('Launch Readiness Dashboard Seed')
    console.log('================================')

    const { getPayload } = await import('payload')
    const configPromise = (await import('../src/payload.config')).default
    const config = await configPromise
    payload = await getPayload({ config })

    const { totalDocs: meditationCount } = await payload.count({
      collection: 'meditations',
      overrideAccess: true,
    })
    const { totalDocs: userChoiceCount } = await payload.count({
      collection: 'user-choices',
      overrideAccess: true,
    })

    if (meditationCount === 0) {
      console.error('\nNo meditations found. Run: pnpm seed meditations')
      process.exit(1)
    }
    if (userChoiceCount === 0) {
      console.error('\nNo user choices found. Run: pnpm seed tags')
      process.exit(1)
    }
    console.log(
      `\nPrerequisites OK: ${meditationCount} meditations, ${userChoiceCount} user choices`,
    )

    const { audioFileId, subtitleFileId } = await createStubFiles(payload)
    const audienceId = await createAudience(payload)
    const lectureIds = await createLectures(payload, audienceId)
    const corePageIds = await createCorePages(payload)
    await seedSubtleSystemPages(payload)
    const { lc1Id, lc2Id } = await createAppCards(payload)
    await updateUserChoices(payload, lectureIds)
    await updateAppConfig(payload, corePageIds, audioFileId, subtitleFileId)
    await setLaunchCriticalCards(payload, lc1Id, lc2Id)

    const port = process.env.PORT ?? '3000'
    console.log('\n✓ Done! Verify at:')
    console.log(
      `  API:   http://localhost:${port}/api/globals/wm-app-status?depth=2&draft=false&locale=en`,
    )
    console.log(`  Admin: http://localhost:${port}/admin/globals/wm-app-status`)
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((payload?.db as any)?.destroy) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (payload?.db as any).destroy()
    }
  }
}

main().catch((error) => {
  console.error('\nFatal error:', error)
  process.exit(1)
})
