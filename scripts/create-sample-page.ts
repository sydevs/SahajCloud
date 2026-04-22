#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Create Sample Blocks Reference Page
 *
 * Generates a comprehensive sample page in the local development database
 * with all 10 Lexical block types and every field variation populated.
 * Serves as a frontend implementation reference.
 *
 * Prerequisites:
 *   pnpm seed tags        # Creates meditation-tags, song-tags
 *   pnpm seed wemeditate  # Creates pages, authors, albums
 *
 * Usage:
 *   pnpm tsx --env-file=.env --env-file=.env.local scripts/create-sample-page.ts
 *
 * Idempotent: finds existing page by slug and updates, or creates if missing.
 */

import type { Manager, Page } from '../src/payload-types'
import type { Payload } from 'payload'

// ============================================================================
// Constants
// ============================================================================

const SLUG = 'sample-blocks-reference'
const PAGE_TITLE = 'Sample Blocks Reference'

// ============================================================================
// Lexical Node Helpers
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function textNode(text: string, format: number = 0) {
  return {
    type: 'text',
    version: 1,
    text,
    format,
    detail: 0,
    mode: 'normal',
    style: '',
  }
}

function paragraphNode(children: unknown[]) {
  return {
    type: 'paragraph',
    version: 1,
    children,
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
  }
}

function headingNode(tag: 'h2' | 'h3', text: string) {
  return {
    type: 'heading',
    version: 1,
    tag,
    children: [textNode(text)],
    direction: null,
    format: '',
    indent: 0,
  }
}

function linkNode(url: string, text: string) {
  return {
    type: 'link',
    version: 3,
    fields: {
      linkType: 'custom',
      url,
      newTab: false,
    },
    children: [textNode(text)],
    direction: null,
    format: '',
    indent: 0,
  }
}

function blockNode(blockType: string, fields: Record<string, unknown>) {
  return {
    type: 'block',
    version: 2,
    fields: {
      id: generateId(),
      blockName: '',
      blockType,
      ...fields,
    },
  }
}

function listItemNode(text: string, value: number) {
  return {
    type: 'listitem',
    version: 1,
    children: [textNode(text)],
    direction: null,
    format: '',
    indent: 0,
    value,
  }
}

function listNode(tag: 'ul' | 'ol', items: string[]) {
  return {
    type: 'list',
    version: 1,
    tag,
    listType: tag === 'ul' ? 'bullet' : 'number',
    start: 1,
    children: items.map((text, i) => listItemNode(text, i + 1)),
    direction: null,
    format: '',
    indent: 0,
  }
}

function blockquoteNode(text: string) {
  return {
    type: 'quote',
    version: 1,
    children: [textNode(text)],
    direction: null,
    format: '',
    indent: 0,
  }
}

// ============================================================================
// Data Fetching
// ============================================================================

interface SeedData {
  imageIds: number[]
  pageIds: number[]
  meditationIds: number[]
  meditationTagIds: number[]
  songTagIds: number[]
  audienceIds: number[]
  appCardIds: number[]
  // Lectures/clips disabled pending issue #291 follow-up.
  // The sample page script will be migrated to `lecture-clips` separately.
  lectureIds: number[]
}

async function fetchSeedData(payload: Payload): Promise<SeedData> {
  console.log('\nFetching seed data...')

  const [images, pages, meditations, meditationTags, songTags, audiences, appCards] =
    await Promise.all([
      payload.find({ collection: 'images', limit: 20, depth: 0 }),
      payload.find({
        collection: 'pages',
        limit: 50,
        depth: 0,
        draft: true, // Include drafts — seeded pages may not be published
        where: { slug: { not_equals: SLUG } },
      }),
      payload.find({ collection: 'meditations', limit: 10, depth: 0 }),
      payload.find({ collection: 'meditation-tags', limit: 10, depth: 0 }),
      payload.find({ collection: 'song-tags', limit: 10, depth: 0 }),
      payload.find({ collection: 'audiences', limit: 10, depth: 0 }),
      payload.find({ collection: 'app-cards', limit: 10, depth: 0 }).catch(() => ({ docs: [] })),
    ])

  const data: SeedData = {
    imageIds: images.docs.map((d) => d.id as number),
    pageIds: pages.docs.map((d) => d.id as number),
    meditationIds: meditations.docs.map((d) => d.id as number),
    meditationTagIds: meditationTags.docs.map((d) => d.id as number),
    songTagIds: songTags.docs.map((d) => d.id as number),
    audienceIds: audiences.docs.map((d) => d.id as number),
    appCardIds: appCards.docs.map((d) => d.id as number),
    // Lectures/clips disabled pending issue #291 follow-up migration.
    lectureIds: [],
  }

  console.log(`  Images: ${data.imageIds.length} found (IDs: ${data.imageIds.slice(0, 5).join(', ')}${data.imageIds.length > 5 ? '...' : ''})`)
  console.log(`  Pages: ${data.pageIds.length} found (IDs: ${data.pageIds.slice(0, 5).join(', ')}${data.pageIds.length > 5 ? '...' : ''})`)
  console.log(`  Meditations: ${data.meditationIds.length} found`)
  console.log(`  Meditation Tags: ${data.meditationTagIds.length} found (IDs: ${data.meditationTagIds.join(', ')})`)
  console.log(`  Song Tags: ${data.songTagIds.length} found (IDs: ${data.songTagIds.join(', ')})`)
  console.log(
    `  Audiences: ${data.audienceIds.length} found${data.audienceIds.length === 0 ? ' (skipping ContentIndex lectures variant)' : ''}`,
  )
  console.log(
    `  App Cards: ${data.appCardIds.length} found${data.appCardIds.length === 0 ? ' (will not include in Showcase)' : ''}`,
  )
  console.log(
    '  Lecture Clips: 0 (lecture-clips sample-page support deferred to issue #291 follow-up)',
  )

  return data
}

function validateSeedData(data: SeedData): void {
  const errors: string[] = []

  if (data.imageIds.length < 3) {
    errors.push(
      `Need at least 3 images (found ${data.imageIds.length}). Run: pnpm seed wemeditate`,
    )
  }
  if (data.pageIds.length < 12) {
    errors.push(
      `Need at least 12 pages for SubtleSystem block (found ${data.pageIds.length}). Run: pnpm seed wemeditate`,
    )
  }
  if (data.meditationTagIds.length === 0) {
    errors.push('Need at least 1 meditation-tag for ContentIndex block. Run: pnpm seed tags')
  }

  // Showcase needs at least 3 items from any combination
  const showcasePool =
    data.meditationIds.length + data.pageIds.length + data.lectureIds.length + data.appCardIds.length
  if (showcasePool < 3) {
    errors.push(
      `Need at least 3 items for Showcase block (found ${showcasePool} total across meditations, pages, lectures, app-cards)`,
    )
  }

  if (errors.length > 0) {
    console.error('\nMissing seed data:')
    errors.forEach((e) => console.error(`  - ${e}`))
    console.error('\nRun seed scripts first:')
    console.error('  pnpm seed tags')
    console.error('  pnpm seed wemeditate')
    process.exit(1)
  }
}

// ============================================================================
// Block Builders
// ============================================================================

/** Pick an image ID, cycling through available images */
function pickImage(data: SeedData, index: number): number {
  return data.imageIds[index % data.imageIds.length]
}

function buildTextBoxBlocks(data: SeedData): unknown[] {
  return [
    // 1. Left image with all optional fields
    blockNode('textbox', {
      image: pickImage(data, 0),
      imagePosition: 'left',
      title: 'Left Image Layout',
      subtitle: 'With subtitle, button, and full text',
      text: 'This text box demonstrates the standard left-aligned image layout. The image appears on the left with text content flowing to the right. This is the most common layout for content sections.',
      buttonText: 'Learn More',
      buttonUrl: 'https://example.com/learn-more',
    }),
    // 2. Right image with wisdom style
    blockNode('textbox', {
      image: pickImage(data, 1),
      imagePosition: 'right',
      wisdomStyle: true,
      title: 'Right Image with Wisdom Style',
      subtitle: 'Ancient wisdom styling applied',
      text: 'This variation uses the right-aligned image position with the "Ancient Wisdom" styling enabled. The visual treatment gives the content a distinctive, contemplative appearance.',
    }),
    // 3. Overlay — left text, dark color
    blockNode('textbox', {
      image: pickImage(data, 2),
      imagePosition: 'overlay',
      textPosition: 'left',
      textColor: 'dark',
      title: 'Background Overlay — Left Dark',
      subtitle: 'Dark text on background image',
      text: 'This overlay variation positions the text on the left side with dark text color, suitable for lighter background images.',
      buttonText: 'Explore',
      buttonUrl: 'https://example.com/explore',
    }),
    // 4. Overlay — right text, light color
    blockNode('textbox', {
      image: pickImage(data, 3 % data.imageIds.length),
      imagePosition: 'overlay',
      textPosition: 'right',
      textColor: 'light',
      title: 'Background Overlay — Right Light',
      subtitle: 'Light text on background image',
      text: 'This overlay variation positions the text on the right side with light text color, suitable for darker background images.',
    }),
    // 5. Overlay — center text, dark color
    blockNode('textbox', {
      image: pickImage(data, 4 % data.imageIds.length),
      imagePosition: 'overlay',
      textPosition: 'center',
      textColor: 'dark',
      title: 'Background Overlay — Centered',
      text: 'This overlay variation centers the text over the background image with dark text color for maximum readability.',
    }),
  ]
}

function buildLayoutBlocks(data: SeedData): unknown[] {
  return [
    // Grid style with sticky title and 4 items
    blockNode('layout', {
      style: 'grid',
      title: 'Grid Layout with Sticky Title',
      items: [
        {
          id: generateId(),
          image: pickImage(data, 0),
          title: 'Grid Item One',
          titleUrl: 'https://example.com/grid-1',
          text: 'First item in the grid layout with image, title link, and descriptive text.',
        },
        {
          id: generateId(),
          image: pickImage(data, 1),
          title: 'Grid Item Two',
          titleUrl: 'https://example.com/grid-2',
          text: 'Second item in the grid layout demonstrating the multi-card pattern.',
        },
        {
          id: generateId(),
          image: pickImage(data, 2),
          title: 'Grid Item Three',
          text: 'Third item without a title link to show that titleUrl is optional.',
        },
        {
          id: generateId(),
          image: pickImage(data, 3 % data.imageIds.length),
          title: 'Grid Item Four',
          text: 'Fourth item showing the grid can hold up to 10 items.',
        },
      ],
    }),
    // Columns style (max 3 items)
    blockNode('layout', {
      style: 'columns',
      title: 'Three-Column Layout',
      items: [
        {
          id: generateId(),
          image: pickImage(data, 0),
          title: 'Column One',
          titleUrl: 'https://example.com/col-1',
          text: 'Columns are limited to a maximum of 3 items for balanced visual presentation.',
        },
        {
          id: generateId(),
          image: pickImage(data, 1),
          title: 'Column Two',
          text: 'Middle column content with image and text.',
        },
        {
          id: generateId(),
          image: pickImage(data, 2),
          title: 'Column Three',
          text: 'Third and final column in the layout.',
        },
      ],
    }),
    // Accordion style (no images)
    blockNode('layout', {
      style: 'accordion',
      title: 'Accordion FAQ Section',
      items: [
        {
          id: generateId(),
          title: 'What is meditation?',
          text: 'Meditation is a practice of focused attention and awareness that helps calm the mind and achieve inner peace.',
        },
        {
          id: generateId(),
          title: 'How do I get started?',
          text: 'Start with just 5-10 minutes of quiet sitting. Focus on your breath and let thoughts pass without attachment.',
        },
        {
          id: generateId(),
          title: 'How often should I meditate?',
          text: 'Daily practice is ideal. Even a short daily session is more beneficial than occasional longer sessions.',
        },
      ],
    }),
    // List style
    blockNode('layout', {
      style: 'list',
      items: [
        {
          id: generateId(),
          title: 'Step One: Preparation',
          text: 'Find a quiet, comfortable place to sit. You can sit on a chair or on the floor.',
        },
        {
          id: generateId(),
          title: 'Step Two: Relaxation',
          text: 'Close your eyes and take a few deep breaths. Allow your body to relax naturally.',
        },
        {
          id: generateId(),
          title: 'Step Three: Meditation',
          text: 'Place your attention at the top of your head. Observe the state of thoughtless awareness.',
        },
      ],
    }),
  ]
}

function buildImageGalleryBlock(data: SeedData): unknown {
  const count = Math.min(data.imageIds.length, 5)
  return blockNode('image-gallery', {
    items: data.imageIds.slice(0, Math.max(count, 3)),
  })
}

function buildShowcaseBlock(data: SeedData): unknown {
  // Build polymorphic relationship items from available collections
  const items: { relationTo: string; value: number }[] = []

  // Add meditations first
  for (const id of data.meditationIds.slice(0, 2)) {
    items.push({ relationTo: 'meditations', value: id })
  }
  // Add pages
  for (const id of data.pageIds.slice(0, 2)) {
    items.push({ relationTo: 'pages', value: id })
  }
  // Lecture clips disabled pending issue #291 follow-up migration.
  // (data.lectureIds is always empty in this branch.)
  // Add app-cards if available
  if (data.appCardIds.length > 0) {
    items.push({ relationTo: 'app-cards', value: data.appCardIds[0] })
  }

  // Ensure minimum 3, maximum 6
  return blockNode('showcase', {
    items: items.slice(0, 6),
  })
}

function buildButtonBlock(): unknown {
  return blockNode('button', {
    text: 'Start Your Meditation Journey',
    url: 'https://wemeditate.com/get-started',
  })
}

function buildQuoteBlocks(): unknown[] {
  return [
    // Full quote with all fields
    blockNode('quote', {
      title: 'On Inner Peace',
      text: 'You cannot know the meaning of your life until you are connected to the power that created you.',
      credit: 'Shri Mataji Nirmala Devi',
      caption: 'Founder of Sahaja Yoga Meditation',
    }),
    // Minimal quote (text only)
    blockNode('quote', {
      text: 'In the silence of meditation, the truth reveals itself without effort. It is the natural state of a human being to be in peace and joy.',
    }),
  ]
}

function buildTableOfContentsBlock(): unknown {
  return blockNode('table-of-contents', {
    title: 'In This Article',
    headings: null,
  })
}

function buildContentIndexBlocks(data: SeedData): unknown[] {
  const blocks: unknown[] = []

  // Meditations (always present if we pass validation)
  blocks.push(
    blockNode('content-index', {
      type: 'meditations',
      meditationFilters: data.meditationTagIds.slice(0, 3),
    }),
  )

  // Pages (always present — uses string enum values, no relationships needed)
  blocks.push(
    blockNode('content-index', {
      type: 'pages',
      pageFilters: ['wisdom', 'lifestyle', 'creativity'],
    }),
  )

  // Songs (if song-tags exist)
  if (data.songTagIds.length > 0) {
    blocks.push(
      blockNode('content-index', {
        type: 'songs',
        songFilters: data.songTagIds.slice(0, 2),
      }),
    )
  } else {
    console.log('  Skipping ContentIndex songs variant (no song-tags)')
  }

  // Lectures (if audiences exist)
  if (data.audienceIds.length > 0) {
    blocks.push(
      blockNode('content-index', {
        type: 'lectures',
        lectureFilters: data.audienceIds.slice(0, 2),
      }),
    )
  } else {
    console.log('  Skipping ContentIndex lectures variant (no audiences)')
  }

  return blocks
}

function buildSubtleSystemBlock(data: SeedData): unknown {
  // Use 12 distinct page IDs for the 12 relationship fields
  const p = data.pageIds
  return blockNode('subtle-system', {
    left: p[0],
    right: p[1],
    center: p[2],
    mooladhara: p[3],
    kundalini: p[4],
    swadhistan: p[5],
    nabhi: p[6],
    void: p[7],
    anahat: p[8],
    vishuddhi: p[9],
    agnya: p[10],
    sahasrara: p[11],
  })
}

function buildSplashBlocks(data: SeedData): unknown[] {
  return [
    // Default layout — all fields
    blockNode('splash', {
      layout: 'default',
      images: [pickImage(data, 0)],
      title: 'Welcome to Meditation',
      subtitle: 'Discover peace within yourself',
      actionText: 'Get Started',
      actionURL: 'https://example.com/get-started',
    }),
    // Countdown layout
    blockNode('splash', {
      layout: 'countdown',
      images: [pickImage(data, 1)],
      title: 'Live Meditation Event',
      subtitle: 'Join us for a guided session',
      actionText: 'Register Now',
      actionURL: 'https://example.com/register',
    }),
    // App promotion layout — multiple images
    blockNode('splash', {
      layout: 'app',
      images: [pickImage(data, 0), pickImage(data, 1)],
      title: 'Meditate Anywhere',
      subtitle: 'Download the We Meditate app',
      actionText: 'Download App',
      actionURL: 'https://apps.apple.com/app/we-meditate',
    }),
    // Map search layout — title/subtitle/actionURL hidden
    blockNode('splash', {
      layout: 'map-search',
      images: [pickImage(data, 2)],
      actionText: 'Find a Class Near You',
    }),
  ]
}

// ============================================================================
// Content Assembly
// ============================================================================

function buildLexicalContent(data: SeedData) {
  console.log('\nBuilding Lexical content...')

  const children: unknown[] = []

  // --- Introduction ---
  children.push(headingNode('h2', 'Sample Blocks Reference Page'))
  children.push(
    paragraphNode([
      textNode('This page contains '),
      textNode('every block type', 1), // bold
      textNode(' available in the Lexical rich text editor, with '),
      textNode('all field variations', 2), // italic
      textNode(
        ' populated. It serves as a comprehensive reference for frontend implementation.',
      ),
    ]),
  )

  // --- TextBox Blocks ---
  children.push(headingNode('h2', 'Text Box Variations'))
  children.push(
    paragraphNode([
      textNode('The TextBox block supports three image positions: '),
      textNode('left', 1),
      textNode(', '),
      textNode('right', 1),
      textNode(', and '),
      textNode('overlay', 1),
      textNode(
        '. The overlay position enables additional controls for text position and color.',
      ),
    ]),
  )
  children.push(...buildTextBoxBlocks(data))

  // --- Layout Blocks ---
  children.push(headingNode('h2', 'Layout Variations'))
  children.push(headingNode('h3', 'Four Layout Styles'))
  children.push(
    paragraphNode([
      textNode('Layouts organize content into '),
      textNode('grid, columns, accordion, or list', 3), // bold + italic
      textNode(' formats. Visit the '),
      linkNode('https://wemeditate.com', 'We Meditate website'),
      textNode(' to see these layouts in action.'),
    ]),
  )
  children.push(...buildLayoutBlocks(data))

  // --- Image Gallery ---
  children.push(headingNode('h2', 'Media & Content Blocks'))
  children.push(headingNode('h3', 'Image Gallery'))
  children.push(
    paragraphNode([
      textNode('The image gallery displays a collection of images in a responsive grid.'),
    ]),
  )
  children.push(buildImageGalleryBlock(data))

  // --- Showcase ---
  children.push(headingNode('h3', 'Content Showcase'))
  children.push(
    listNode('ul', [
      'Showcases display 3-6 featured content items',
      'Supports meditations, pages, lectures, and app cards',
      'Items are displayed as rich preview cards',
    ]),
  )
  children.push(buildShowcaseBlock(data))

  // --- Button ---
  children.push(headingNode('h2', 'Interactive Elements'))
  children.push(headingNode('h3', 'Call-to-Action Button'))
  children.push(buildButtonBlock())

  // --- Quotes ---
  children.push(headingNode('h3', 'Quote Blocks'))
  children.push(
    paragraphNode([
      textNode('Quotes can include an optional title, credit, and caption:'),
    ]),
  )
  children.push(...buildQuoteBlocks())

  // Lexical blockquote (distinct from our Quote block)
  children.push(
    blockquoteNode(
      'This is a Lexical blockquote — a standard rich text formatting element, distinct from the Quote block above.',
    ),
  )

  // --- Table of Contents ---
  children.push(headingNode('h2', 'Navigation Blocks'))
  children.push(
    paragraphNode([
      textNode(
        'The Table of Contents block automatically generates navigation from page headings.',
      ),
    ]),
  )
  children.push(buildTableOfContentsBlock())

  // --- Content Index ---
  children.push(headingNode('h2', 'Content Discovery'))
  children.push(
    paragraphNode([
      textNode('Content Index blocks display filterable grids of content by type:'),
    ]),
  )
  children.push(
    listNode('ol', [
      'Meditations — filtered by meditation tags',
      'Pages — filtered by page tags (wisdom, lifestyle, creativity, event, technique)',
      'Songs — filtered by song/music tags',
      'Lectures — filtered by lecture tags',
    ]),
  )
  children.push(...buildContentIndexBlocks(data))

  // --- Subtle System ---
  children.push(headingNode('h2', 'Subtle System'))
  children.push(
    paragraphNode([
      textNode('The Subtle System block links to pages for all '),
      textNode('3 channels', 1),
      textNode(' and '),
      textNode('9 chakras', 1),
      textNode(', providing an interactive exploration of the subtle energy system.'),
    ]),
  )
  children.push(buildSubtleSystemBlock(data))

  // --- Splash Blocks ---
  children.push(headingNode('h2', 'Splash Screens'))
  children.push(headingNode('h3', 'Four Layout Options'))
  children.push(
    paragraphNode([
      textNode('Splash blocks provide full-width hero sections with different layout styles. The '),
      textNode('map-search', 2),
      textNode(' layout hides the title, subtitle, and action URL fields.'),
    ]),
  )
  children.push(...buildSplashBlocks(data))

  // Count block nodes
  const blockCount = children.filter(
    (c) => typeof c === 'object' && c !== null && (c as { type?: string }).type === 'block',
  ).length
  const richTextCount = children.length - blockCount
  console.log(`  ${blockCount} block nodes + ${richTextCount} rich text sections`)

  return {
    root: {
      type: 'root',
      version: 1,
      children,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
    },
  } as unknown as Page['content']
}

// ============================================================================
// Page Upsert
// ============================================================================

async function upsertSamplePage(
  payload: Payload,
  content: Page['content'],
  user: Manager,
): Promise<number> {
  console.log('\nUpserting page...')

  const existing = await payload.find({
    collection: 'pages',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
  })

  const pageData = {
    title: PAGE_TITLE,
    slug: SLUG,
    content,
    _status: 'published' as const,
  }

  try {
    if (existing.docs.length > 0) {
      const id = existing.docs[0].id as number
      await payload.update({
        collection: 'pages',
        id,
        data: pageData,
        overrideAccess: true,
        user,
      })
      console.log(`  Updated existing page (ID: ${id})`)
      return id
    } else {
      const created = await payload.create({
        collection: 'pages',
        data: pageData,
        overrideAccess: true,
        user,
      })
      const id = created.id as number
      console.log(`  Created new page (ID: ${id})`)
      return id
    }
  } catch (error: unknown) {
    // Log detailed validation errors for debugging
    if (error && typeof error === 'object' && 'data' in error) {
      const errData = (error as { data?: { errors?: { path?: string; message?: string }[] } }).data
      if (errData?.errors) {
        console.error('\nValidation error details:')
        for (const e of errData.errors) {
          console.error(`  ${e.path}: ${e.message}`)
        }
      }
    }
    throw error
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  let payload: Payload | null = null

  try {
    console.log('Sample Blocks Reference Page Creator')
    console.log('=====================================')

    // Dynamic import to ensure env vars are loaded first
    const { getPayload } = await import('payload')
    const configPromise = (await import('../src/payload.config')).default

    // Initialize Payload
    const config = await configPromise
    payload = await getPayload({ config })

    // Authenticate as admin to satisfy relationship validation in Lexical blocks.
    // Lexical's applyBaseFilterToFields wraps all relationship fields inside blocks
    // with a filterOptions function that checks admin.hidden({ user }). Without an
    // authenticated user, collections appear "hidden" and all relationship IDs are
    // rejected as invalid selections.
    const admin = await payload.find({
      collection: 'managers',
      where: { type: { equals: 'admin' } },
      limit: 1,
      depth: 0,
    })
    if (admin.docs.length === 0) {
      console.error('\nNo admin manager found. Create one first via the admin panel.')
      process.exit(1)
    }
    const user = admin.docs[0]

    // Fetch and validate seed data
    const data = await fetchSeedData(payload)
    validateSeedData(data)

    // Build Lexical content with all block types
    const content = buildLexicalContent(data)

    // Upsert the page
    const pageId = await upsertSamplePage(payload, content, user)

    const port = process.env.PORT || '3000'
    console.log('\nDone! Verify at:')
    console.log(`  Admin: http://localhost:${port}/admin/collections/pages/${pageId}`)
    console.log(
      `  API:   http://localhost:${port}/api/pages?where[slug][equals]=${SLUG}&depth=2`,
    )
  } finally {
    if (payload?.db?.destroy) {
      await payload.db.destroy()
    }
  }
}

main().catch((error) => {
  console.error('\nFatal error:', error)
  process.exit(1)
})
