import type { AutoCommitChange, ChangeSource } from './AutoCommitPlanTypes';

export type AutoCommitGitRead = (args: string[]) => Promise<string>;

export async function readSnapshotChanges(run: AutoCommitGitRead, base: string, target: string, source: ChangeSource): Promise<AutoCommitChange[]> {
  const args = ['--no-ext-diff', '--no-textconv', '--ignore-submodules=none', '--find-renames', base, target, '--'];
  const raw = (await run(['diff', '--raw', '--no-abbrev', '-z', ...args])).split('\0');
  const changes: AutoCommitChange[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const header = raw[index].match(/^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([A-Z]\d*)$/);
    if (!header) continue;
    const firstPath = raw[++index];
    const renamed = /^[RC]/.test(header[5]);
    const filePath = renamed ? raw[++index] : firstPath;
    if (!filePath) throw new Error('Invalid Git snapshot path.');
    changes.push({
      id: `${source === 'staged' ? 's' : 'w'}${changes.length + 1}`,
      source,
      path: filePath,
      ...(renamed ? { originalPath: firstPath } : {}),
      oldMode: header[1],
      newMode: header[2],
      oldBlob: header[3],
      newBlob: header[4],
      status: header[5],
      additions: 0,
      deletions: 0,
      binary: false,
    });
  }
  const byPath = new Map(changes.map((change) => [change.path, change]));
  const stats = (await run(['diff', '--numstat', '-z', ...args])).split('\0');
  for (let index = 0; index < stats.length; index += 1) {
    const record = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(stats[index]);
    if (!record) continue;
    let filePath = record[3];
    if (!filePath) {
      index += 1;
      filePath = stats[++index];
    }
    const change = byPath.get(filePath);
    if (!change) continue;
    change.binary = record[1] === '-' || record[2] === '-';
    change.additions = change.binary ? 0 : Number(record[1]);
    change.deletions = change.binary ? 0 : Number(record[2]);
  }
  return changes;
}

export async function assertAutoCommitState(run: AutoCommitGitRead): Promise<void> {
  const location = await run(['rev-parse', '--is-bare-repository', '--absolute-git-dir']);
  const separator = location.indexOf('\n');
  if (location.slice(0, separator).trim() === 'true') throw new Error('AI Auto-Commit requires a working tree.');
  if (separator < 0) throw new Error('Could not inspect repository operation state.');
  const directory = location.slice(separator + 1).replace(/\r?\n$/, '');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_START']) {
    if (existsSync(join(directory, name))) throw new Error(`Finish the running Git operation (${name}) before AI Auto-Commit.`);
  }
}
