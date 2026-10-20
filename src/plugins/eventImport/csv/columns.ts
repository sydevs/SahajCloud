/**
 * The CSV column spec — one declaration that both the parser and the
 * downloadable template read.
 *
 * ⚠ **This is the only place a column name is written.** The template is
 * generated from this array (`template.ts`), and the parser validates against
 * it (`../rows.ts`), so a renamed column cannot ship a template the import then
 * refuses. A hand-written template drifted from the parser in the Atlas seed's
 * own tooling and cost a maintainer an afternoon of "invalid column" reports.
 */

import { EVENT_TYPE_OPTIONS } from '@/collections/Events/eventOptions'
import { RECURRENCE_OPTIONS, WEEKDAY_OPTIONS } from '@/fields/scheduleFields'

/** The values the select columns take, read off the Events fields they write. */
export const EVENT_TYPES = EVENT_TYPE_OPTIONS.map(({ value }) => value)
export const RECURRENCE_TYPES = RECURRENCE_OPTIONS.map(({ value }) => value)
export const WEEKDAY_CODES = WEEKDAY_OPTIONS.map(({ value }) => value)

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
  /**
   * Where the row writes it on an event, so Payload's own refusal of the value
   * (`../validate.ts`) is reported under this column.
   */
  field?: string
}

/**
 * ⚠ **`contactPhone`, `contactEmail` and `contactName` are published as
 * entered.** The template's help text says so, because the person filling it in
 * is usually not the person whose details go in the column.
 */
export const IMPORT_COLUMNS: readonly ColumnSpec[] = [
  {
    name: 'title',
    field: 'title',
    requirement: 'always',
    help: 'The class name as a seeker should read it.',
    example: 'Tuesday Evening Meditation',
  },
  {
    name: 'eventType',
    field: 'eventType',
    requirement: 'always',
    help: `${EVENT_TYPES.join(' or ')}.`,
    example: 'offline',
  },
  {
    name: 'country',
    field: 'address.country',
    requirement: 'always',
    help: 'Two-letter ISO country code, e.g. DE.',
    example: 'DE',
  },
  {
    name: 'city',
    field: 'address.city',
    requirement: 'always',
    help: 'Town or city. An online class is placed in it, too.',
    example: 'Berlin',
  },
  {
    name: 'address',
    field: 'address.street',
    requirement: 'offline',
    help: 'Street address, without the city or country.',
    example: 'Oranienstraße 25',
  },
  {
    name: 'state',
    field: 'address.region',
    requirement: 'optional',
    help: 'State, province or region. Improves the address match where a city name repeats.',
    example: 'Berlin',
  },
  {
    name: 'postcode',
    field: 'address.postCode',
    requirement: 'optional',
    help: 'Postal code.',
    example: '10999',
  },
  {
    name: 'venueName',
    field: 'address.venueName',
    requirement: 'optional',
    help: 'The building or hall, where it has a name a seeker would look for.',
    example: 'Community Hall',
  },
  {
    name: 'room',
    field: 'address.room',
    requirement: 'optional',
    help: 'Room or floor within the venue.',
    example: 'Room 2',
  },
  {
    name: 'onlineUrl',
    field: 'onlineUrl',
    requirement: 'online',
    help: 'Meeting link.',
    example: '',
  },
  {
    name: 'description',
    field: 'description',
    requirement: 'optional',
    help: 'Plain text. Line breaks become paragraphs.',
    example: 'A free weekly meditation class for beginners.',
  },
  {
    name: 'website',
    field: 'website',
    requirement: 'optional',
    help: 'A page about this class.',
    example: '',
  },
  {
    name: 'contactName',
    field: 'contactName',
    requirement: 'optional',
    help: 'Published as entered — the name a seeker sees.',
    example: 'Anna',
  },
  {
    name: 'contactPhone',
    field: 'contactPhone',
    requirement: 'optional',
    help: 'Published as entered. Include the country code.',
    example: '+49 30 123456',
  },
  {
    name: 'contactEmail',
    field: 'contactEmail',
    requirement: 'optional',
    help: 'Published as entered.',
    example: 'anna@example.org',
  },
  {
    name: 'languages',
    field: 'languages',
    requirement: 'optional',
    help: 'Comma-separated locale codes, e.g. "de,en". Blank uses the batch default.',
    example: 'de,en',
  },
  {
    name: 'managerName',
    requirement: 'optional',
    help: "The class manager's name. Used only when managerEmail names a new account.",
    example: 'Anna Schmidt',
  },
  {
    name: 'managerEmail',
    requirement: 'optional',
    help: 'The manager who vouches for this class. Blank publishes it unverified.',
    example: 'anna.schmidt@example.org',
  },
  {
    name: 'registrationLimit',
    field: 'registrationLimit',
    requirement: 'optional',
    help: 'Maximum registrations. Blank means unlimited.',
    example: '',
  },
  {
    name: 'recurrenceType',
    requirement: 'optional',
    field: 'schedule.recurrenceType',
    help: `${RECURRENCE_TYPES.join(', ')}. Blank for a one-off class.`,
    example: 'WEEKLY',
  },
  {
    name: 'inactive',
    requirement: 'optional',
    field: 'inactive',
    help: 'TRUE for a dormant class with no schedule: leave every schedule column blank and give a contact phone or email.',
    example: '',
  },
  {
    name: 'date',
    requirement: 'optional',
    field: 'schedule.firstDate',
    help: 'YYYY-MM-DD. Required unless the class is inactive: the date of a one-off class, or the first occurrence.',
    // ⚠ **A Tuesday, because the example row's `weekdays` is `TU`.** A weekly
    // row whose date falls on another weekday is refused, so an inconsistent
    // pair here would ship a template the parser rejects.
    example: '2026-01-06',
  },
  {
    name: 'startTime',
    requirement: 'optional',
    field: 'schedule.firstDate',
    help: 'HH:MM, 24-hour, e.g. 09:30. Required unless the class is inactive.',
    example: '18:30',
  },
  {
    name: 'endTime',
    field: 'schedule.endTime',
    requirement: 'optional',
    help: 'HH:MM, 24-hour, same day, e.g. 20:00.',
    example: '20:00',
  },
  {
    name: 'weekdays',
    field: 'schedule.weekdays',
    requirement: 'optional',
    help: `Weekly classes only: the days it meets, from ${WEEKDAY_CODES.join(',')}. Blank uses the weekday of the date.`,
    example: 'TU',
  },
  {
    name: 'interval',
    field: 'schedule.interval',
    requirement: 'optional',
    help: 'Repeat every N days, weeks or months. Blank means every one.',
    example: '',
  },
  {
    name: 'untilDate',
    field: 'schedule.untilDate',
    requirement: 'optional',
    help: 'YYYY-MM-DD. Blank means the class repeats indefinitely.',
    example: '',
  },
] as const

/** A parsed row, before any value has been interpreted. */
export type RawImportRow = Record<string, string>

const COLUMN_NAMES = new Set(IMPORT_COLUMNS.map(({ name }) => name))

/** Whether the header cell names a column the import knows. */
export function isImportColumn(name: string): boolean {
  return COLUMN_NAMES.has(name)
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
