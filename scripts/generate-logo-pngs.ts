/**
 * Operator script: convert the project logos to PNG files, for use in
 * emails.
 *
 * Email clients render SVG poorly: Gmail strips it, and Outlook ignores
 * it. WebP support is also patchy. So transactional emails use a PNG
 * version of the brand icon, alongside the source SVG or WebP file.
 * Re-run this script whenever a source logo changes, and commit the
 * regenerated PNGs.
 *
 * Usage:  pnpm tsx scripts/generate-logo-pngs.ts
 */

import path from 'path'

import sharp from 'sharp'

/** Square output size in pixels. Emails show the icon at 48px. 256px gives headroom for retina screens. */
const SIZE = 256
const IMAGES_DIR = path.resolve(process.cwd(), 'public/images')

const LOGOS: { source: string; output: string }[] = [
  { source: 'sahaj-cloud.svg', output: 'sahaj-cloud.png' },
  { source: 'wemeditate-web.svg', output: 'wemeditate-web.png' },
  { source: 'wemeditate-app.svg', output: 'wemeditate-app.png' },
  { source: 'sahaj-atlas.webp', output: 'sahaj-atlas.png' },
]

async function main() {
  for (const { source, output } of LOGOS) {
    await sharp(path.join(IMAGES_DIR, source), { density: 384 })
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(IMAGES_DIR, output))
    console.log(`✓ ${source} → ${output}`)
  }
  console.log(`\nWrote ${LOGOS.length} PNG logos to public/images/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
