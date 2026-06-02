/**
 * Generate `statusConfig.json` files from each project's `StatusGlobalSpec`.
 *
 * Chained into `pnpm generate:types` so devs running their existing
 * post-schema-change workflow keep the JSON in sync automatically.
 *
 * Add a new project by registering its spec + output path below.
 */

import { writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import { extractStatusConfig, type StatusGlobalSpec } from '../src/lib/status'

import { WeMeditateAppStatusSpec } from '../src/globals/WeMeditateAppStatus/WeMeditateAppStatus'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

type Target = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: StatusGlobalSpec<any>
  /** Repo-relative output path. */
  outputPath: string
}

const TARGETS: Target[] = [
  {
    spec: WeMeditateAppStatusSpec,
    outputPath: 'src/globals/WeMeditateAppStatus/statusConfig.json',
  },
]

function writeTarget(target: Target) {
  const json = extractStatusConfig(target.spec)
  const out = `${JSON.stringify(json, null, 2)}\n`
  const fullPath = resolve(REPO_ROOT, target.outputPath)
  writeFileSync(fullPath, out, 'utf8')
  console.log(`✓ wrote ${target.outputPath}`)
}

for (const target of TARGETS) writeTarget(target)
