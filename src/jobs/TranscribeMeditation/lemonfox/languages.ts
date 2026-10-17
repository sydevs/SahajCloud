import ISO6391 from 'iso-639-1'

import { baseLanguage, type LocaleCode } from '@/lib/locales'

/**
 * The Lemonfox name of a meditation's locale: `en` → `english`, `pt-BR` →
 * `portuguese`, since Whisper knows languages, not regions.
 *
 * `undefined` for a language Lemonfox does not list, which it then detects
 * instead. Every locale this app offers is listed today, and
 * `tests/unit/lemonfox-client.spec.ts` asserts that over the whole closed set —
 * so the `undefined` answer is what a twentieth locale gets until the vendor
 * grows a name for it.
 */
export function lemonfoxLanguage(locale: LocaleCode): string | undefined {
  const name = ISO6391.getName(baseLanguage(locale)).toLowerCase()
  return LEMONFOX_LANGUAGES.has(name) ? name : undefined
}

/**
 * The language names Lemonfox accepts, from its API reference
 * (https://www.lemonfox.ai/apis/speech-to-text). Naming the language improves
 * accuracy and latency; a name outside this list would be refused, which is why
 * the list is the vendor's rather than derived from our own locales.
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
