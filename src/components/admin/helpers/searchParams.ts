/**
 * Reading a server component's `searchParams`, which every admin view that
 * keeps its state in the URL has to do the same way.
 *
 * Next hands a repeated key over as an array, so a bare `searchParams[key]`
 * is `string | string[]` and a visitor appending `?page=1&page=2` decides
 * which. Both readers take the first value and refuse anything else.
 */
type SearchParams = Record<string, string | string[] | undefined> | undefined

/** The first value of `key`, or undefined. */
export function firstParam(params: SearchParams, key: string): string | undefined {
  const value = params?.[key]
  return Array.isArray(value) ? value[0] : value
}

/** A page number, at least 1, falling back to the first page. */
export function pageParam(params: SearchParams, key = 'page'): number {
  return Math.max(1, Number.parseInt(firstParam(params, key) ?? '', 10) || 1)
}
