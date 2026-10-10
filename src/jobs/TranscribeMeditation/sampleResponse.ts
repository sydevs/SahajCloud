/**
 * Placeholder speech for deployments with no Lemonfox key, shaped like a
 * Lemonfox `verbose_json` body so it runs through the same normalizer.
 *
 * Each line starts at a fraction of the recording, so every phrase can be
 * seeked to in the preview whatever the meditation's length.
 */
const SAMPLE_LINES: { at: number; text: string }[] = [
  { at: 0, text: 'Welcome. Sit comfortably, with your hands open on your lap.' },
  { at: 0.04, text: 'Allow your attention to settle. Take a moment to feel comfortable.' },
  { at: 0.12, text: "Let's now put our right hand on our heart." },
  { at: 0.14, text: 'Keep the left hand resting on your lap, with the palm facing upward.' },
  {
    at: 0.3,
    text: 'Feel the stillness within. There is nothing to do, just allow yourself to be here.',
  },
  { at: 0.45, text: 'Now place your right palm on the top of your head.' },
  { at: 0.47, text: 'Keep your attention there for a moment.' },
  { at: 0.65, text: 'Bring both hands back to your lap, palms facing upward.' },
  { at: 0.67, text: "Let's enjoy this feeling in silence." },
  { at: 0.92, text: 'Slowly open your eyes. Thank you for meditating with us.' },
]

const SECONDS_PER_WORD = 0.35

/** Used when the meditation has no stored duration. */
const DEFAULT_DURATION_SECONDS = 600

export function sampleLemonfoxResponse(durationSeconds?: number | null) {
  const duration =
    durationSeconds && durationSeconds > 0 ? durationSeconds : DEFAULT_DURATION_SECONDS
  const startOf = (at: number) => Math.round(at * duration * 10) / 10
  const segments = SAMPLE_LINES.map(({ at, text }, id) => {
    const start = startOf(at)
    const next = SAMPLE_LINES[id + 1]
    const room = (next ? startOf(next.at) : duration) - start
    const tokens = text.split(' ')
    // A short recording squeezes each line into the time before the next one.
    const perWord = Math.min(SECONDS_PER_WORD, room / tokens.length)
    const words = tokens.map((word, index) => ({
      word,
      start: start + index * perWord,
      end: start + (index + 1) * perWord,
    }))
    return { id, text: ` ${text}`, start, end: words[words.length - 1].end, words }
  })
  return {
    task: 'transcribe',
    language: 'english',
    duration,
    text: SAMPLE_LINES.map(({ text }) => text).join(' '),
    segments,
  }
}
