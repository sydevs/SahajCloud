/**
 * The registration-questions contract, shared across owners: the Events
 * collection enables questions, the Registrations collection validates the
 * stored answers, the register endpoint shapes them, and the manager
 * notification email forwards them.
 *
 * It lives in `src/lib/` rather than a collection folder precisely because it is
 * used by more than one owner — colocating it in `Events/` would force a
 * cross-collection import from `Registrations/` (see
 * `.claude/rules/project-structure.md`).
 */

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

/** A registrant's answer to one registration question, labelled for display. */
export interface RegistrationAnswer {
  label: string
  value: string
}

const CONFIGURED_QUESTION_NAMES = new Set<string>(
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
    if (!CONFIGURED_QUESTION_NAMES.has(key)) {
      return `Unknown registration question: "${key}".`
    }
    if (typeof answer !== 'string') {
      return `The answer for "${key}" must be text.`
    }
  }
  return true
}

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
 * Shape a registrant's raw `questions` answers into labelled rows for the
 * manager notification: configured questions first, in their configured order,
 * using their labels; then any extra keys (validation rejects these on write,
 * but stored/legacy data may still carry them), labelled by the raw key. Blank
 * answers are dropped.
 */
export function buildRegistrationAnswers(
  questions: Record<string, unknown> | null | undefined,
): RegistrationAnswer[] {
  if (!questions || typeof questions !== 'object') return []

  const answers: RegistrationAnswer[] = []

  for (const question of EVENT_REGISTRATION_QUESTIONS) {
    if (!(question.name in questions)) continue
    const value = formatAnswer(questions[question.name])
    if (value) answers.push({ label: question.label, value })
  }

  for (const [key, raw] of Object.entries(questions)) {
    if (CONFIGURED_QUESTION_NAMES.has(key)) continue
    const value = formatAnswer(raw)
    if (value) answers.push({ label: key, value })
  }

  return answers
}
