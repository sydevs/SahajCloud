import { describe, expect, it } from 'vitest'

import { computeMeditationNodeWeights } from '@/hooks/meditationHooks'

describe('computeMeditationNodeWeights', () => {
  it('returns {} for empty frames', () => {
    expect(computeMeditationNodeWeights({ frames: [], duration: 60 })).toEqual({})
  })

  it('returns {} when duration is 0 or negative', () => {
    const frames = [{ timestamp: 0, subtleSystemNode: { slug: 'mooladhara' } }]
    expect(computeMeditationNodeWeights({ frames, duration: 0 })).toEqual({})
    expect(computeMeditationNodeWeights({ frames, duration: -10 })).toEqual({})
  })

  it('a single frame spans to duration', () => {
    const frames = [{ timestamp: 0, subtleSystemNode: { slug: 'anahat' } }]
    expect(computeMeditationNodeWeights({ frames, duration: 42 })).toEqual({ anahat: 42 })
  })

  it('multi-frame timeline: each frame spans to next, last spans to duration', () => {
    const frames = [
      { timestamp: 0, subtleSystemNode: { slug: 'mooladhara' } },
      { timestamp: 10, subtleSystemNode: { slug: 'anahat' } },
      { timestamp: 30, subtleSystemNode: { slug: 'sahasrara' } },
    ]
    expect(computeMeditationNodeWeights({ frames, duration: 60 })).toEqual({
      mooladhara: 10, // 0 → 10
      anahat: 20, // 10 → 30
      sahasrara: 30, // 30 → 60
    })
  })

  it('repeated nodes accumulate', () => {
    const frames = [
      { timestamp: 0, subtleSystemNode: { slug: 'agnya' } },
      { timestamp: 5, subtleSystemNode: { slug: 'anahat' } },
      { timestamp: 15, subtleSystemNode: { slug: 'agnya' } },
    ]
    expect(computeMeditationNodeWeights({ frames, duration: 30 })).toEqual({
      agnya: 5 + 15, // 0→5 plus 15→30
      anahat: 10, // 5→15
    })
  })

  it('frames with null subtleSystemNode are skipped (the "Other" bucket)', () => {
    const frames = [
      { timestamp: 0, subtleSystemNode: { slug: 'void' } },
      { timestamp: 5, subtleSystemNode: null },
      { timestamp: 15, subtleSystemNode: { slug: 'kundalini' } },
    ]
    expect(computeMeditationNodeWeights({ frames, duration: 25 })).toEqual({
      void: 5, // 0→5
      kundalini: 10, // 15→25
      // 5→15 contributes nothing (null node)
    })
  })

  it('frames with unpopulated relationship (raw id) are skipped', () => {
    const frames = [
      { timestamp: 0, subtleSystemNode: 42 }, // id only — caller forgot depth: 1
      { timestamp: 10, subtleSystemNode: { slug: 'vishuddhi' } },
    ]
    expect(computeMeditationNodeWeights({ frames, duration: 30 })).toEqual({
      vishuddhi: 20, // 10→30
    })
  })

  it('frames with object node missing slug are skipped', () => {
    const frames = [
      { timestamp: 0, subtleSystemNode: { slug: '' } },
      { timestamp: 5, subtleSystemNode: { slug: null } },
      { timestamp: 10, subtleSystemNode: { slug: 'sushumna' } },
    ]
    expect(computeMeditationNodeWeights({ frames, duration: 25 })).toEqual({
      sushumna: 15, // 10→25
    })
  })

  it('zero-window frames (consecutive identical timestamps) contribute nothing', () => {
    const frames = [
      { timestamp: 0, subtleSystemNode: { slug: 'pingala' } },
      { timestamp: 5, subtleSystemNode: { slug: 'ida' } }, // window 5→5 = 0
      { timestamp: 5, subtleSystemNode: { slug: 'sushumna' } },
    ]
    // ida's window is 0 — `> 0` guard drops it entirely (no key in the result)
    expect(computeMeditationNodeWeights({ frames, duration: 20 })).toEqual({
      pingala: 5, // 0→5
      sushumna: 15, // 5→20
    })
  })
})
