import type { GitRunOptions } from './GitProcessTypes';

const contextIds = new WeakMap<object, number>();
let nextContextId = 0;
const contextId = (context: object | undefined) => {
  if (!context) return null;
  let id = contextIds.get(context);
  if (id === undefined) {
    id = ++nextContextId;
    contextIds.set(context, id);
  }
  return id;
};

/** Only callers expecting the same output and execution context can share a read. */
export function gitPollingKey(result: 'text' | 'result', args: string[], options: GitRunOptions): string {
  return JSON.stringify([
    result,
    args,
    options.coalesceKey ?? null,
    Object.entries(options.envOverrides ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    contextId(options.signal),
    contextId(options.onOutput),
  ]);
}
