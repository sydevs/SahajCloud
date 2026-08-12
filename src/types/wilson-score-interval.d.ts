declare module 'wilson-score-interval' {
  /**
   * Wilson score interval for `up` successes out of `total` trials (95%
   * confidence): `left` is the conservative lower bound, `right` the upper.
   */
  export default function wilson(up: number, total: number): { left: number; right: number }
}
