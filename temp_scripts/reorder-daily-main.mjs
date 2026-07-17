// Reorder + section the `daily.main` translation leaf so it reads in the order
// an editor sees it in the app, grouped by reel page / screen area.
//
// Order and grouping come from an audit of daily_tab.dart (reel slivers at
// :936-977, long panel at :1624-1661). Keys keep their names — stored
// translations and the seed are keyed on them; only order/section/description
// change, all of which are presentational.
import { readFileSync, writeFileSync } from 'node:fs'

const P = 'src/globals/WeMeditateAppTranslations/translationsSchema.json'
const schema = JSON.parse(readFileSync(P, 'utf8'))
const leaf = schema.properties.daily.properties.main
const old = leaf.properties

// [key, section, description]. Order here IS the order editors see.
const SPEC = [
  // --- reel page 1 ---
  ['your_morning_meditation', 'Daily hero', 'Hero title in the morning.'],
  ['your_afternoon_meditation', 'Daily hero', 'Hero title in the afternoon.'],
  ['your_evening_meditation', 'Daily hero', 'Hero title in the evening.'],
  ['morning_meditation_subtitle', 'Daily hero', 'Hero subtitle in the morning.'],
  ['afternoon_meditation_subtitle', 'Daily hero', 'Hero subtitle in the afternoon.'],
  ['evening_meditation_subtitle', 'Daily hero', 'Hero subtitle in the evening.'],
  ['start_meditation', 'Daily hero', 'Main button to begin the suggested meditation.'],
  ['scroll_to_the_path', 'Daily hero', 'Scroll cue at the bottom of the first screen.'],

  // --- reel page 2 ---
  ['path_going_deeper_title', 'Path promo', 'Title of the Path promo screen.'],
  ['path_going_deeper_subtitle', 'Path promo', 'Subtitle under that title.'],
  ['start_the_course', 'Path promo', 'Button for someone who has not started the Path.'],
  ['continue_the_course', 'Path promo', 'Button for someone already past the first Path step.'],

  // --- reel page 3, top ---
  [
    'shri_mataji_talks_title',
    'Learn from the source',
    'FALLBACK — only when no card is set in App Cards. Normally the card’s own title is shown.',
  ],
  [
    'shri_mataji_talks_subtitle',
    'Learn from the source',
    'FALLBACK — only when no card is set in App Cards. Normally the card’s own subtitle is shown.',
  ],
  [
    'see_more',
    'Learn from the source',
    'FALLBACK button label. Normally the card’s own button text is shown.',
  ],
  [
    'start_now',
    'Learn from the source',
    'FALLBACK button label on the first-meditation card. Normally the card’s own button text is shown.',
  ],
  [
    'hero_label_learn_from_source',
    'Learn from the source',
    'FALLBACK small label above the card. Normally the card’s own section label is shown.',
  ],
  [
    'hero_label_get_started',
    'Learn from the source',
    'FALLBACK small label, before the first meditation.',
  ],
  [
    'hero_label_try_something_new',
    'Learn from the source',
    'FALLBACK small label when the card is a meditation.',
  ],
  [
    'hero_label_meditate_with_others',
    'Learn from the source',
    'FALLBACK small label when the card points at classes.',
  ],
  ['hero_label_discover', 'Learn from the source', 'FALLBACK small label for any other card.'],

  // --- reel page 3, middle ---
  ['whats_your_priority_today', 'What’s your priority today?', 'Heading during the day.'],
  ['whats_your_priority_tonight', 'What’s your priority today?', 'Heading in the evening.'],
  ['quick_morning', 'What’s your priority today?', 'First tile in the morning.'],
  ['quick_afternoon', 'What’s your priority today?', 'First tile in the afternoon.'],
  ['quick_evening', 'What’s your priority today?', 'First tile in the evening.'],
  ['longer_session', 'What’s your priority today?', 'Second tile.'],
  ['help_me_deal', 'What’s your priority today?', 'Third tile.'],
  ['explore_deeper', 'What’s your priority today?', 'Fourth tile.'],
  [
    'help_me_deal_custom_title',
    'What’s your priority today?',
    'Title of the screen opened by the third tile.',
  ],

  // --- reel page 3, bottom ---
  ['meditate_with_others', 'Meditate with others', 'Heading above the two class tiles.'],
  ['find_class_near_you', 'Meditate with others', 'Left tile.'],
  ['join_live_online_class', 'Meditate with others', 'Right tile.'],
  ['improve_your_meditation', 'Meditate with others', 'Heading above the highlights carousel.'],
  [
    'improve_card_techniques_title',
    'Meditate with others',
    'FALLBACK — only when no highlight cards are set in App Cards.',
  ],
  [
    'improve_card_techniques_subtitle',
    'Meditate with others',
    'FALLBACK — only when no highlight cards are set in App Cards.',
  ],
  [
    'improve_card_subtle_system_title',
    'Meditate with others',
    'FALLBACK — only when no highlight cards are set in App Cards.',
  ],
  [
    'improve_card_subtle_system_subtitle',
    'Meditate with others',
    'FALLBACK — only when no highlight cards are set in App Cards.',
  ],

  // --- shared chrome ---
  ['minutes_short', 'Card chrome', 'Short duration suffix on cards, e.g. the “min” in “12 min”.'],
  ['live_now', 'Card chrome', 'Badge on a card while a live class is running.'],
  ['live_countdown_days', 'Card chrome', 'Countdown on a card, days before a live class.'],
  ['live_countdown_hours', 'Card chrome', 'Countdown on a card, hours before a live class.'],
  ['live_countdown_minutes', 'Card chrome', 'Countdown on a card, minutes before a live class.'],

  // --- not displayed: matched against, so edits change behaviour ---
  [
    'start_course',
    'Button matching (not shown on screen)',
    'NOT DISPLAYED. Matched against a card’s button text to detect the “start course” action — changing it can stop that matching working.',
  ],
  [
    'continue_course',
    'Button matching (not shown on screen)',
    'NOT DISPLAYED. Matched against a card’s button text to detect the “continue course” action.',
  ],
  [
    'start_label',
    'Button matching (not shown on screen)',
    'NOT DISPLAYED. Matched against a card’s button text.',
  ],
  [
    'continue_label',
    'Button matching (not shown on screen)',
    'NOT DISPLAYED. Matched against a card’s button text.',
  ],
]

// Keys the audit proved render nowhere in the app (zero usages).
const DEAD = [
  'the_path_going_deeper',
  'whats_your_priority_tag',
  'meditate_with_others_tag',
  'improve_meditation_tag',
  'unlock_guided_meditations',
  'highlights_title',
  'get_back_in_the_flow',
  'live_reminder_button_active',
  'live_reminder_notification_title',
  'live_reminder_notification_body',
  'live_reminder_permission_denied',
  'live_reminder_permission_settings',
]
// Renders on the Check Vibes talk screen, not Daily — misfiled here.
const MISFILED = ['learn_from_source']

const next = {}
for (const [key, section, description] of SPEC) {
  if (!old[key]) {
    console.log(`  !! spec key missing from schema: ${key}`)
    continue
  }
  next[key] = { ...old[key], section, description }
}

const handled = new Set([...SPEC.map((s) => s[0]), ...DEAD, ...MISFILED])
const unhandled = Object.keys(old).filter((k) => !handled.has(k))
// Never silently drop: anything unaccounted for keeps its place at the end.
for (const k of unhandled) next[k] = old[k]

leaf.properties = next
leaf.description = 'The Daily (home) tab — three full-height screens the user scrolls through.'
writeFileSync(P, JSON.stringify(schema, null, 2) + '\n')

console.log(`kept+ordered: ${Object.keys(next).length}`)
console.log(`removed as dead (${DEAD.length}): ${DEAD.join(', ')}`)
console.log(`removed as misfiled (${MISFILED.length}): ${MISFILED.join(', ')}`)
console.log(`unhandled, left at end (${unhandled.length}): ${unhandled.join(', ') || 'none'}`)

// keep the seed in step with the schema
const SP = 'seeds/wm-app-translations/data.en.json'
const seed = JSON.parse(readFileSync(SP, 'utf8'))
const dm = seed.daily_main
if (dm) {
  let dropped = 0
  for (const k of [...DEAD, ...MISFILED])
    if (k in dm) {
      delete dm[k]
      dropped++
    }
  const reordered = {}
  for (const k of Object.keys(next)) if (k in dm) reordered[k] = dm[k]
  for (const k of Object.keys(dm)) if (!(k in reordered)) reordered[k] = dm[k]
  seed.daily_main = reordered
  writeFileSync(SP, JSON.stringify(seed, null, 2) + '\n')
  console.log(`seed daily_main: dropped ${dropped}, reordered to match schema`)
}
