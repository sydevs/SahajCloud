/**
 * Select-option arrays for the Events collection enums.
 *
 * Values mirror the Atlas source enums (see seeds/atlas/MIGRATION_PLAN.md):
 * Rails STI / integer enums / Ruby bitmasks are remapped to these strings by
 * the Phase 3 importer.
 */

import { VERIFICATION_STAGES } from '@/lib/eventVerification/stages'

export const EVENT_TYPE_OPTIONS = [
  { label: 'Offline', value: 'offline' },
  { label: 'Online', value: 'online' },
] as const

const VERIFICATION_STAGE_LABELS: Record<(typeof VERIFICATION_STAGES)[number], string> = {
  verified: 'Verified',
  reminded: 'Reminded',
  escalated: 'Escalated',
  urgent: 'Urgent',
  expired: 'Expired',
  finished: 'Finished',
}

/**
 * Verification lifecycle stages — the single source of truth for both the
 * lifecycle status and the escalation step (replaces the old `status` enum and
 * a separate stage counter). The daily ExpireEvents job advances
 * verified → reminded → escalated → expired; `finished` is terminal. Built from
 * the canonical `VERIFICATION_STAGES` list so the enum can't drift from the
 * job/hook logic. ("Archived" is a Payload soft-delete, not a stage here.)
 */
export const VERIFICATION_STAGE_OPTIONS = VERIFICATION_STAGES.map((value) => ({
  label: VERIFICATION_STAGE_LABELS[value],
  value,
}))

/**
 * Where registrants sign up. `sahaj-atlas` = handled natively in the Atlas app
 * (registrations stored here); `external` = any third-party link (Meetup,
 * Eventbrite, Facebook, etc. all collapse into this).
 */
export const EVENT_REGISTRATION_MODE_OPTIONS = [
  { label: 'Sahaj Atlas', value: 'sahaj-atlas' },
  { label: 'External', value: 'external' },
] as const

/**
 * Optional questions an event can ask registrants. Rendered as a group of
 * checkboxes on the Event (each label IS the question shown to the registrant);
 * checking one includes that question on the registration form. Placeholder
 * wording — refine per the real registration flow.
 */
export const EVENT_REGISTRATION_QUESTIONS = [
  { name: 'priorExperience', label: 'Have you practised Sahaja Yoga meditation before?' },
  { name: 'referralSource', label: 'How did you hear about this event?' },
  { name: 'healthInfo', label: 'Is there anything about your health we should know?' },
  { name: 'accessibility', label: 'Do you have any accessibility requirements?' },
  { name: 'guests', label: 'Will you be bringing any guests?' },
] as const

/** A configured registration-question key (`priorExperience`, `referralSource`, …). */
export type EventRegistrationQuestionName = (typeof EVENT_REGISTRATION_QUESTIONS)[number]['name']

/**
 * The stored shape of a registration's `questions` field: each configured
 * question key maps to the registrant's (string) answer. Every key is optional —
 * an event enables only some questions, and a registrant may skip any.
 */
export type RegistrationQuestions = Partial<Record<EventRegistrationQuestionName, string>>

const EVENT_REGISTRATION_QUESTION_NAMES = new Set<string>(
  EVENT_REGISTRATION_QUESTIONS.map((question) => question.name),
)

/**
 * Enforce the `questions` structure on write: an object whose keys are all
 * configured question names and whose values are strings. Returns `true` or an
 * error message. Pure JS (no `jsonSchema` — Payload would compile that to an Ajv
 * `new Function()` validator, which throws under Cloudflare's codegen ban; see
 * `src/fields/translationsField.ts`).
 */
export function validateRegistrationQuestions(value: unknown): true | string {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) {
    return 'Registration answers must be an object of question answers.'
  }
  for (const [key, answer] of Object.entries(value)) {
    if (!EVENT_REGISTRATION_QUESTION_NAMES.has(key)) {
      return `Unknown registration question: "${key}".`
    }
    if (typeof answer !== 'string') {
      return `The answer for "${key}" must be text.`
    }
  }
  return true
}

/** A registrant's answer to one registration question, labelled for display. */
export interface RegistrationAnswer {
  label: string
  value: string
}

const QUESTION_LABELS = new Map<string, string>(
  EVENT_REGISTRATION_QUESTIONS.map((question) => [question.name, question.label]),
)

/** Render one raw answer value as a display string, or `''` to skip it. */
function formatAnswer(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  if (typeof raw === 'number') return String(raw)
  if (Array.isArray(raw))
    return raw
      .map((entry) => String(entry).trim())
      .filter(Boolean)
      .join(', ')
  return ''
}

/**
 * Shape a registrant's raw `questions` answers (the record stored on the
 * registration) into labelled rows for the manager notification. Keys map to
 * their configured question label, falling back to the key for anything not in
 * `EVENT_REGISTRATION_QUESTIONS`; blank answers are dropped. Ordered to follow
 * the configured question order, then any extra keys.
 */
export function buildRegistrationAnswers(
  questions: Record<string, unknown> | null | undefined,
): RegistrationAnswer[] {
  if (!questions || typeof questions !== 'object') return []

  const answers: RegistrationAnswer[] = []
  const seen = new Set<string>()

  const push = (key: string) => {
    if (seen.has(key) || !(key in questions)) return
    seen.add(key)
    const value = formatAnswer(questions[key])
    if (value) answers.push({ label: QUESTION_LABELS.get(key) ?? key, value })
  }

  for (const question of EVENT_REGISTRATION_QUESTIONS) push(question.name)
  for (const key of Object.keys(questions)) push(key)

  return answers
}
