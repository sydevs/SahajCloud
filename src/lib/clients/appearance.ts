/**
 * How a service's atlas looks: its logo, and the three colours it paints with.
 *
 * Separate from `site.ts`, which is where the atlas *lives*. An address and a
 * theme are two vocabularies, and `src/lib/branding/` already owns the third —
 * the per-project brand — so this one is named for the Install tab's own word
 * for it rather than taking `branding` a second time.
 *
 * Shared by the `Clients` schema, the colour field and its reset, and the
 * Install tab's preview. Pure, with no import of its own, so a client component
 * reaching it pulls nothing server-side in behind it.
 */

/**
 * What the atlas paints with while a colour is unset, keyed by the `Clients`
 * column that overrides each.
 *
 * ⚠ Mirrors `DEFAULT_SEEDS` in SahajAtlasWeb's `src/config/theme/palette.ts`,
 * where `color3` themes the `contrast` role. Change both together.
 *
 * ⚠ `color1` is unchanged by sydevs/SahajAtlasWeb#389 and its generated ladder
 * still moved: no teal passes the panel-text check at any saturation worth
 * calling teal, so the widget corrects the step rather than the seed. Only
 * `color2` and `color3` are retunable, and both were retuned there.
 */
export const ATLAS_DEFAULT_COLORS = {
  color1: '#1E6C71',
  color2: '#5e98ba',
  color3: '#d8735a',
} as const

/** The logo a service without one of its own is shown with. */
export const DEFAULT_SERVICE_LOGO = '/images/wemeditate-web.svg'

/**
 * Whether a colour carries a hue, as the Atlas widget reads one.
 *
 * ⚠ Mirrors `isBrandSeed` and `MIN_BRAND_SATURATION` in SahajAtlasWeb's
 * `src/config/theme/palette.ts`: the widget treats black, white and grey as
 * unset, so an achromatic value here is shown as the default, because that is
 * what visitors see.
 */
export function isBrandColor(hex: string | null | undefined): hex is string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex ?? '')
  if (!match) return false
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : match[1]
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return false
  const lightness = (max + min) / 2
  const saturation = (max - min) / (1 - Math.abs(2 * lightness - 1))
  return saturation * 100 >= 5
}

/** The colour the atlas actually paints with for one column: the service's, or the default. */
export function effectiveColor(
  column: keyof typeof ATLAS_DEFAULT_COLORS,
  value: string | null | undefined,
): string {
  return isBrandColor(value) ? value : ATLAS_DEFAULT_COLORS[column]
}
