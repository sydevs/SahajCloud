import type {
  Payload,
  PayloadRequest,
  TaskConfig,
  TaskHandlerArgs,
  TaskInput,
  TaskOutput,
  TaskType,
} from 'payload'

/**
 * Invoke a job task's `handler` directly, bypassing the queue.
 *
 * Five int specs used to hand-roll this, and each one reached for
 * `Parameters<typeof SomeTask.handler>[0]` to type the args. That never
 * compiled: `TaskConfig['handler']` is `string | TaskHandler<TSlug>` — a task
 * may point at a module path instead of a function — and `Parameters<T>`
 * rejects the union (`TS2344`, 20 of #606 Phase 2's errors). The `typeof`
 * guard below narrows the union properly, so `TaskHandlerArgs<TSlug>` is
 * available for the stub fields and the whole thing typechecks without casts.
 *
 * The return type comes from the generated `TypedJobs` output schema, so the
 * shapes each spec used to redeclare by hand (`ExpireResult`, `DigestResult`,
 * `SyncOutput`, …) are now checked against the job's real contract instead of
 * drifting from it.
 */
export async function runTaskHandler<TSlug extends TaskType>(
  task: TaskConfig<TSlug>,
  {
    payload,
    input,
    context = {},
  }: {
    payload: Payload
    /** Task input. Every task we run this way declares `input?: unknown`. */
    input?: TaskInput<TSlug>
    /** Seeds `req.context` — the window jobs read an injected `now` from it. */
    context?: PayloadRequest['context']
  },
): Promise<TaskOutput<TSlug>> {
  if (typeof task.handler !== 'function') {
    throw new Error(
      'runTaskHandler needs an inline handler; this task config points at a module path.',
    )
  }

  // Handlers only ever touch `payload`, `context` and `headers`, so the rest of
  // PayloadRequest is deliberately absent — hence the double assertion.
  const req = { payload, context, headers: new Headers() } as unknown as PayloadRequest

  const result = await task.handler({
    req,
    input: input as TaskHandlerArgs<TSlug>['input'],
    // Queue plumbing. No task under test reads `job`/`tasks`; `inlineTask`
    // throws rather than no-op'ing so a handler that grows a sub-task can't
    // silently receive `undefined` where an output is expected.
    job: {} as TaskHandlerArgs<TSlug>['job'],
    tasks: {} as TaskHandlerArgs<TSlug>['tasks'],
    inlineTask: (() => {
      throw new Error('runTaskHandler does not support inline sub-tasks.')
    }) as unknown as TaskHandlerArgs<TSlug>['inlineTask'],
  })

  if (result.state === 'failed') {
    throw new Error(result.errorMessage ?? `Task handler reported state: 'failed'.`)
  }
  return result.output
}
