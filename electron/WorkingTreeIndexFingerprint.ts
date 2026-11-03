import { StringDecoder } from 'node:string_decoder';
import type { Hash } from 'node:crypto';
import type { GitService } from './GitService';
import { gitArgumentBatches } from './git/GitArgumentBatches';
import { toLiteralPathspec } from './git/RepositoryPathSafety';

/** Keep only changed paths while streaming a potentially much larger index. */
export async function fingerprintWorkingTreeIndex(git: GitService, repo: string, paths: string[], hash: Hash, signal?: AbortSignal) {
  const selected = new Set(paths);
  const records = new Map<string, string[]>();
  const accept = (record: string) => {
    if (!record) return;
    const tab = record.indexOf('\t');
    if (tab < 0 || !/^\d{6} [a-f0-9]{40,64} [0-3]$/.test(record.slice(0, tab))) throw new Error('Invalid Git index record.');
    const file = record.slice(tab + 1);
    if (selected.has(file)) records.set(file, [...(records.get(file) || []), record]);
  };
  const batches = [...gitArgumentBatches(paths.map((file) => toLiteralPathspec(file)))];
  if (batches.length > 1 && typeof git.streamReadAtPath === 'function') {
    const decoder = new StringDecoder('utf8');
    let pending = '';
    await git.streamReadAtPath(
      repo,
      ['ls-files', '--stage', '-z'],
      (chunk) => {
        signal?.throwIfAborted();
        pending += decoder.write(chunk);
        let end;
        while ((end = pending.indexOf('\0')) >= 0) {
          accept(pending.slice(0, end));
          pending = pending.slice(end + 1);
        }
        if (pending.length > 1024 * 1024) throw new Error('Git index record is too large.');
      },
      signal || new AbortController().signal,
    );
    pending += decoder.end();
    if (pending) throw new Error('Incomplete Git index record.');
  } else {
    for (const [index, batch] of batches.entries()) {
      signal?.throwIfAborted();
      const args = ['ls-files', '--stage', '-z', '--', ...batch];
      const output =
        signal && typeof git.runCommandAtPathWithSignal === 'function'
          ? await git.runCommandAtPathWithSignal(repo, args, signal, 'background')
          : await git.runPollingCommandAtPath(repo, args, `working-tree-snapshot:index:${index}:${batch.join('\0')}`);
      for (const record of output.split('\0')) accept(record);
    }
  }
  signal?.throwIfAborted();
  hash.update('index-stage\0');
  for (const file of paths) for (const record of (records.get(file) || []).sort()) hash.update(record).update('\0');
}
