/** The timestamp a row has to predate to fall inside a window. */
export const retentionCutoff = (now: Date, days: number): string =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
