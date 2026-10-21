#!/usr/bin/env node

/**
 * Payload Types Generation Hook (PostToolUse / Edit|Write)
 *
 * Kept thin on purpose: which edits regenerate types is in `scripts/payload-types-hook.mjs`, and
 * why it lives outside `.claude/` is in `scripts/hook-run.mjs`.
 */

import { readFileSync } from 'fs'

import { respond } from '../../scripts/hook-run.mjs'
import { runTypesHook } from '../../scripts/payload-types-hook.mjs'

console.log(respond(() => readFileSync(0, 'utf-8'), runTypesHook, 'Payload types hook'))
