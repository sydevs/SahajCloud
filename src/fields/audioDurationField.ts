import type { Field, NumberField, UIField } from 'payload'

export interface AudioDurationFieldOptions {
  /** How the warning names the recording: `This <noun> has no duration`. */
  noun: string
  /** What else goes missing, as a clause completing `…, so <consequence>.` */
  consequence: string
  /** Set where the seconds carry no meaning for the editor. The warning still shows. */
  hideValue?: boolean
}

/**
 * The seconds `extractAudioDuration` stores, and the warning shown when the
 * audio stated none. Both callers mount the hook, so a notice on one of them
 * leaves the other's editor with a value silently cleared (#1236).
 */
export function audioDurationField({
  noun,
  consequence,
  hideValue,
}: AudioDurationFieldOptions): Field[] {
  const notice: UIField = {
    name: 'durationNotice',
    type: 'ui',
    admin: {
      custom: {
        type: 'warning',
        title: `This ${noun} has no duration`,
        text: `Its audio states no length, so ${consequence}. Re-export the file with a duration and upload it again.`,
      },
      components: { Field: '@/components/admin/InfoBanner' },
      condition: (data) => !!data?.id && data?.duration == null,
    },
  }

  const value: NumberField = {
    name: 'duration',
    type: 'number',
    label: 'Duration (seconds)',
    admin: {
      readOnly: true,
      ...(hideValue
        ? { hidden: true }
        : { description: 'Read from the audio whenever one is uploaded.' }),
    },
  }

  return [notice, value]
}
