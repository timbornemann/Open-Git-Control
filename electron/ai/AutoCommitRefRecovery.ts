import type { AutoCommitGitRead } from './AutoCommitSnapshot';

export async function rollbackAutoCommitRef(
  run: AutoCommitGitRead,
  targetRef: string,
  expectedHead: string | null,
  action: string,
): Promise<'unchanged' | 'rolled-back' | 'unsafe'> {
  const read = async (args: string[]) =>
    run(args).then(
      (value) => value.trim(),
      () => null,
    );
  if (targetRef === 'HEAD' && (await read(['symbolic-ref', '-q', 'HEAD']))) return 'unchanged';
  const current = await read(['rev-parse', '--verify', targetRef]);
  if (current === expectedHead) return 'unchanged';
  if (!current) return expectedHead ? 'unsafe' : 'unchanged';
  const raw = await read(['reflog', 'show', '--max-count=256', '--format=%H%x00%gs', targetRef]);
  if (!raw) return 'unsafe';
  const entries = raw.split(/\r?\n/).map((line) => {
    const separator = line.indexOf('\0');
    return { hash: line.slice(0, separator), subject: line.slice(separator + 1) };
  });
  const owned = (entry: (typeof entries)[number]) => entry.subject === action || entry.subject.startsWith(`${action}:`);
  if (entries[0].hash !== current || !owned(entries[0])) return 'unsafe';
  const ownedEntries = [];
  for (const entry of entries) {
    if (!owned(entry)) break;
    ownedEntries.push(entry);
  }
  if (ownedEntries.length === 256) return 'unsafe';
  const parents = (await run(['rev-list', '--parents', '-n', '1', ownedEntries.at(-1)!.hash])).trim().split(/\s+/).slice(1);
  const args = targetRef === 'HEAD' ? ['update-ref', '--no-deref'] : ['update-ref'];
  await run(parents[0] ? [...args, '-m', 'rollback failed AI auto-commit', targetRef, parents[0], current] : [...args, '-d', targetRef, current]);
  return 'rolled-back';
}
