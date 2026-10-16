/**
 * The Lemonfox name of a meditation's locale: `en` → `english`, `pt-BR` →
 * `portuguese`, since Whisper knows languages, not regions. `undefined` for a
 * language Lemonfox does not list, which it then detects instead.
 */
export function lemonfoxLanguage(locale: string): string | undefined {
  try {
    const { language } = new Intl.Locale(locale)
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(language)?.toLowerCase()
    return name && LEMONFOX_LANGUAGES.has(name) ? name : undefined
  } catch {
    return undefined
  }
}

/**
 * The language names Lemonfox accepts, from its API reference
 * (https://www.lemonfox.ai/apis/speech-to-text). Naming the language improves
 * accuracy and latency; a name outside this list would be refused.
 */
const LEMONFOX_LANGUAGES = new Set(
  [
    'english chinese german spanish russian korean french japanese portuguese turkish polish',
    'catalan dutch arabic swedish italian indonesian hindi finnish vietnamese hebrew ukrainian',
    'greek malay czech romanian danish hungarian tamil norwegian thai urdu croatian bulgarian',
    'lithuanian latin maori malayalam welsh slovak telugu persian latvian bengali serbian',
    'azerbaijani slovenian kannada estonian macedonian breton basque icelandic armenian nepali',
    'mongolian bosnian kazakh albanian swahili galician marathi punjabi sinhala khmer shona',
    'yoruba somali afrikaans occitan georgian belarusian tajik sindhi gujarati amharic yiddish',
    'lao uzbek faroese pashto turkmen nynorsk maltese sanskrit luxembourgish myanmar tibetan',
    'tagalog malagasy assamese tatar hawaiian lingala hausa bashkir javanese sundanese cantonese',
  ]
    .join(' ')
    .split(' '),
)
