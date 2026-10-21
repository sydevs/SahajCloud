#!/usr/bin/env node

/**
 * Unit Test Hook (PostToolUse / Edit|Write) — Tier 1 of `docs/rules/testing-reqs.md`.
 *
 * Kept thin on purpose: the logic is in `scripts/unit-test-hook.mjs`, and why it lives outside
 * `.claude/` is in `scripts/hook-run.mjs`.
 */

import { readFileSync } from 'fs'

import { respond } from '../../scripts/hook-run.mjs'
import { runHook } from '../../scripts/unit-test-hook.mjs'

console.log(respond(() => readFileSync(0, 'utf-8'), runHook, 'unit-test hook'))
