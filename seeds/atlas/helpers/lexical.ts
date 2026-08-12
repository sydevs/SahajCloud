/**
 * Moved to `src/lib/richEditor/plainTextToLexical.ts` so the event-submission
 * accept flow (src) can share it — seeds may import from `@/lib`, never the
 * reverse. Re-exported here so existing importer call sites stay unchanged.
 */
export {
  plainTextToLexical,
  type LexicalValue,
} from '@/lib/richEditor/plainTextToLexical'
