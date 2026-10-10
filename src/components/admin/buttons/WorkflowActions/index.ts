// The default export alone, on purpose: `stages.ts` is what a collection config
// imports, and re-exporting it here would let a config reach the contract
// through the client component — see that file's own warning.
export { default } from './WorkflowActions'
