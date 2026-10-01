/**
 * The CSV column spec — one declaration that both the parser and the
 * downloadable template read.
 *
 * ⚠ **This is the only place a column name is written.** The template is
 * generated from this array (`template.ts`), and the parser validates against
 * it (`parse.ts`), so a renamed column cannot ship a template the parser then
 * refuses. A hand-written template drifted from the parser in the Atlas seed's
 * own tooling and cost a maintainer an afternoon of "invalid column" reports.
 */

/** When a column must carry a value. */
export type ColumnRequirement =
  /** Every row. */
  | 'always'
  /** Rows whose `eventType` is `offline`. */
  | 'offline'
  /** Rows whose `eventType` is `online`. */
  | 'online'
  /** Never — the import falls back to the batch default or leaves it unset. */
  | 'optional'

export interface ColumnSpec {
  /** The header, exactly as the parser matches it. */
  name: string
  requirement: ColumnRequirement
  /** What the template tells the volunteer filling it in. */
  help: string
  /** The template's one example row. */
  example: string
}

/**
 * ⚠ **`contactPhone`, `contactEmail` and `contactName` are published as
 * entered.** The template's help text says so, because the person filling it in
 * is usually not the person whose details go in the column.
 */
export const IMPORT_COLUMNS: readonly ColumnSpec[] = [
  {
    name: 'title',
    requirement: 'always',
    help: 'The class name as a seeker should read it.',
    example: 'Tuesday Evening Meditation',
  },
  {
    name: 'eventType',
    requirement: 'always',
    help: 'offline or online.',
    example: 'offline',
  },
  {
    name: 'country',
    requirement: 'always',
    help: 'Two-letter ISO country code, e.g. DE.',
    example: 'DE',
  },
  {
    name: 'city',
    requirement: 'offline',
    help: 'Town or city. Required for offline classes; used to place online ones.',
    example: 'Berlin',
  },
  {
    name: 'address',
    requirement: 'offline',
    help: 'Street address, without the city or country.',
    example: 'Oranienstraße 25',
  },
  {
    name: 'state',
    requirement: 'optional',
    help: 'State, province or region. Improves the address match where a city name repeats.',
    example: 'Berlin',
  },
  {
    name: 'postcode',
    requirement: 'optional',
    help: 'Postal code.',
    example: '10999',
  },
  {
    name: 'latitude',
    requirement: 'optional',
    help: 'Decimal degrees. Given with longitude, this becomes the map point.',
    example: '',
  },
  {
    name: 'longitude',
    requirement: 'optional',
    help: 'Decimal degrees. Given with latitude, this becomes the map point.',
    example: '',
  },
  {
    name: 'venueName',
    requirement: 'optional',
    help: 'The building or hall, where it has a name a seeker would look for.',
    example: 'Community Hall',
  },
  {
    name: 'room',
    requirement: 'optional',
    help: 'Room or floor within the venue.',
    example: 'Room 2',
  },
  {
    name: 'onlineUrl',
    requirement: 'online',
    help: 'Meeting link. Required for online classes.',
    example: '',
  },
  {
    name: 'description',
    requirement: 'optional',
    help: 'Plain text. Line breaks become paragraphs.',
    example: 'A free weekly meditation class for beginners.',
  },
  {
    name: 'website',
    requirement: 'optional',
    help: 'A page about this class.',
    example: '',
  },
  {
    name: 'contactName',
    requirement: 'optional',
    help: 'Published as entered — the name a seeker sees.',
    example: 'Anna',
  },
  {
    name: 'contactPhone',
    requirement: 'optional',
    help: 'Published as entered. Include the country code.',
    example: '+49 30 123456',
  },
  {
    name: 'contactEmail',
    requirement: 'optional',
    help: 'Published as entered.',
    example: 'anna@example.org',
  },
  {
    name: 'languages',
    requirement: 'optional',
    help: 'Comma-separated locale codes, e.g. "de,en". Blank uses the batch default.',
    example: 'de,en',
  },
  {
    name: 'managerName',
    requirement: 'optional',
    help: "The coordinator's name. Used only when managerEmail names a new account.",
    example: 'Anna Schmidt',
  },
  {
    name: 'managerEmail',
    requirement: 'optional',
    help: 'The coordinator who vouches for this class. Blank publishes it unverified.',
    example: 'anna.schmidt@example.org',
  },
  {
    name: 'registrationLimit',
    requirement: 'optional',
    help: 'Maximum registrations. Blank means unlimited.',
    example: '',
  },
  {
    name: 'timezone',
    requirement: 'optional',
    help: 'IANA zone, e.g. Europe/Berlin. Blank derives it from the location.',
    example: '',
  },
  {
    name: 'scheduleType',
    requirement: 'always',
    help: 'one-off, weekly, monthly or inactive.',
    example: 'weekly',
  },
  {
    name: 'date',
    requirement: 'optional',
    help: 'YYYY-MM-DD. The date for one-off; the first date for weekly and monthly. Blank uses the next matching day.',
    example: '',
  },
  {
    name: 'startTime',
    requirement: 'optional',
    help: 'HH:MM, 24-hour. Required unless scheduleType is inactive.',
    example: '18:30',
  },
  {
    name: 'endTime',
    requirement: 'optional',
    help: 'HH:MM, 24-hour, same day.',
    example: '20:00',
  },
  {
    name: 'weekdays',
    requirement: 'optional',
    help: 'Comma-separated two-letter codes for weekly classes, e.g. "MO,TH".',
    example: 'TU',
  },
  {
    name: 'interval',
    requirement: 'optional',
    help: 'Repeat every N weeks or months. Blank means every one.',
    example: '',
  },
  {
    name: 'monthWeek',
    requirement: 'optional',
    help: 'For monthly classes: 1-4 for the first to fourth week, or -1 for the last. Needs a single weekday.',
    example: '',
  },
  {
    name: 'untilDate',
    requirement: 'optional',
    help: 'YYYY-MM-DD. Blank means the class repeats indefinitely.',
    example: '',
  },
] as const

/** Header names in template order. */
export const IMPORT_COLUMN_NAMES: readonly string[] = IMPORT_COLUMNS.map(({ name }) => name)

/** A parsed row, before any value has been interpreted. */
export type RawImportRow = Record<string, string>

const BY_NAME = new Map(IMPORT_COLUMNS.map((column) => [column.name, column]))

export function findColumn(name: string): ColumnSpec | undefined {
  return BY_NAME.get(name)
}

/**
 * Columns a row of this `eventType` must carry.
 *
 * An unrecognised `eventType` yields the `always` set only: the row already
 * fails on the bad type, and guessing which location columns it owed would
 * bury that one real error under four derived ones.
 */
export function requiredColumnsFor(eventType: string | undefined): readonly string[] {
  return IMPORT_COLUMNS.filter(
    ({ requirement }) => requirement === 'always' || requirement === eventType,
  ).map(({ name }) => name)
}
