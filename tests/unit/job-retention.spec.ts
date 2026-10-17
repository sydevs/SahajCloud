import { describe, expect, it } from 'vitest'

import { CleanupJobs, JOB_RETENTION_DAYS, jobRetentionCutoff } from '@/jobs/CleanupJobs/CleanupJobs'

describe('job retention', () => {
  it('puts the cutoff a week behind the clock it is given', () => {
    expect(jobRetentionCutoff(new Date('2026-10-17T05:00:00.000Z'))).toBe(
      '2026-10-10T05:00:00.000Z',
    )
  })

  it('keeps the window at a week', () => {
    expect(JOB_RETENTION_DAYS).toBe(7)
  })

  it('sweeps weekly on the queue that runs unattended', () => {
    expect(CleanupJobs.schedule).toEqual([{ cron: '0 5 * * 0', queue: 'nightly' }])
  })
})
