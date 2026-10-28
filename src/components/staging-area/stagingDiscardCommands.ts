import { MAX_ARGS_BY_GIT_COMMAND } from '@/shared/ipc/gitCommands';

/** Keep filtered selections literal and within the existing checkout IPC limit.
 * Only the explicit, unfiltered repository scope may use the fast whole-tree path. */
export function buildDiscardCommands(paths: readonly string[], wholeRepository = false): string[][] {
  const selected = [...new Set(paths.filter((file) => file.length > 0))];
  if (!selected.length) return [];
  if (wholeRepository) return [['checkout', '--', '.']];
  const batchSize = Math.max(1, (MAX_ARGS_BY_GIT_COMMAND.checkout ?? 5) - 1);
  const commands: string[][] = [];
  for (let offset = 0; offset < selected.length; offset += batchSize) commands.push(['checkout', '--', ...selected.slice(offset, offset + batchSize)]);
  return commands;
}
