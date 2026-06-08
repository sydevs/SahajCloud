import ISO6391 from 'iso-639-1'

export interface LanguageOption {
  label: string
  value: string
}

/**
 * Select options for every ISO 639-1 language (~183 entries), sorted
 * alphabetically by English name. Each option's value is the two-letter
 * ISO 639-1 code.
 *
 * Shared by the Atlas Events `languageCode` and Regions
 * `defaultEventLanguage` fields. This is the broad language set — distinct
 * from the 16 app `LOCALES` in this folder, which are the locales the CMS
 * itself is translated into.
 */
export function getLanguageOptions(): LanguageOption[] {
  return ISO6391.getAllCodes()
    .map((code) => ({ value: code, label: ISO6391.getName(code) }))
    .filter((option) => option.label !== '')
    .sort((a, b) => a.label.localeCompare(b.label))
}
