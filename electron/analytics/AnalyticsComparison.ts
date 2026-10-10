import type { AnalyticsComparison } from '../../src/shared/ipc/repositoryAnalytics';
import type { AnalyticsGit } from './AnalyticsGit';
import type { AnalyticsCache } from './AnalyticsCache';
import type { AnalyticsRules } from './AnalyticsRules';
import type { CommitRecord, FileChange } from './AnalyticsTypes';
import { AnalyticsLogParser } from './AnalyticsParsing';
import { eligibleChanges } from './AnalyticsAggregation';

export function summarizeComparison(changes: FileChange[]): NonNullable<AnalyticsComparison['summary']> {
  const fileChanges = { added: 0, modified: 0, deleted: 0, renamed: 0 };
  const areas = new Map<string, { path: string; files: number; additions: number; deletions: number }>();
  let nonTextFiles = 0;
  for (const change of changes) {
    const status = change.status[0];
    if (status === 'A' || status === 'C') fileChanges.added++;
    else if (status === 'D') fileChanges.deleted++;
    else if (status === 'R') fileChanges.renamed++;
    else fileChanges.modified++;
    nonTextFiles += Number(change.binary);
    const path = change.path.includes('/') ? change.path.split('/')[0] + '/' : '.';
    const area = areas.get(path) ?? { path, files: 0, additions: 0, deletions: 0 };
    area.files++;
    area.additions += change.additions;
    area.deletions += change.deletions;
    areas.set(path, area);
  }
  return {
    fileChanges,
    textFiles: changes.length - nonTextFiles,
    nonTextFiles,
    areas: [...areas.values()].sort((a, b) => b.files - a.files || a.path.localeCompare(b.path)),
  };
}

export async function readComparison(git: AnalyticsGit, from: string, to: string): Promise<CommitRecord> {
  let record: CommitRecord | undefined;
  const parser = new AnalyticsLogParser((value) => {
    record = value;
  });
  parser.write(Buffer.from(`\x1e${to}\0\0\0\0${Math.floor(Date.now() / 1000)}\0\0`));
  await git.stream(['diff', '--no-ext-diff', '--no-textconv', '--raw', '--numstat', '--no-abbrev', '-M', '-z', from, to], (chunk) => parser.write(chunk));
  parser.finish();
  if (!record) throw new Error('Could not read release comparison.');
  return record;
}
export async function buildComparison(
  git: AnalyticsGit,
  cache: AnalyticsCache,
  rules: AnalyticsRules,
  record: CommitRecord,
  hashes: string[],
  from: string,
  to: string,
  fromOid: string,
  toOid: string,
  path: string,
): Promise<AnalyticsComparison> {
  let ancestor = true;
  try {
    await git.text(['merge-base', '--is-ancestor', fromOid, toOid]);
  } catch (error) {
    git.signal.throwIfAborted();
    if (!/failed \(1\)/.test(String(error))) throw error;
    ancestor = false;
  }
  const changes = eligibleChanges(record, rules, path, cache.data.blobs);
  const authors = new Set(
    hashes
      .map((hash) => cache.data.commits.get(hash))
      .filter((commit): commit is CommitRecord => Boolean(commit))
      .map((commit) => rules.author(commit.author).id),
  );
  return {
    from,
    to,
    fromOid,
    toOid,
    ancestor,
    commits: hashes.length,
    contributors: authors.size,
    additions: changes.reduce((sum, change) => sum + change.additions, 0),
    deletions: changes.reduce((sum, change) => sum + change.deletions, 0),
    files: changes.length,
    summary: summarizeComparison(changes),
    paths: changes.map((change) => ({
      path: change.path,
      oldPath: change.oldPath,
      additions: change.additions,
      deletions: change.deletions,
      changes: 1,
      authors: authors.size,
      lastChanged: cache.data.commits.get(toOid)?.date ?? record.date,
      hash: toOid,
      binary: change.binary,
    })),
  };
}
