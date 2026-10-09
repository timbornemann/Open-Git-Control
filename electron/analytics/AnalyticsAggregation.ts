import type { AnalyticsChanges, AnalyticsContribution, AnalyticsCoupling, AnalyticsFilters, AnalyticsPeriod } from '../../src/shared/ipc/repositoryAnalytics';
import type { CommitRecord, BlobRecord, FileChange } from './AnalyticsTypes';
import type { AnalyticsRules } from './AnalyticsRules';

type MutableHotspot = AnalyticsChanges & { people: Set<string> };
type AggregationRules = Pick<AnalyticsRules, 'ignored' | 'author'>;
export function pathMatches(path: string, filter: string) {
  return !filter || path === filter || path.startsWith(filter.replace(/\/$/, '') + '/');
}
export function dateMatches(date: number, since: string, until: string) {
  const from = since ? new Date(`${since}T00:00:00`).getTime() : -Infinity;
  const to = until ? new Date(`${until}T23:59:59.999`).getTime() : Infinity;
  return date >= from && date <= to;
}
export function localDate(date: number): string {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function bucket(date: number, aggregation: string): string {
  if (aggregation === 'month') return localDate(date).slice(0, 7) + '-01';
  if (aggregation === 'week') {
    const value = new Date(date);
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
    return localDate(value.getTime());
  }
  return localDate(date);
}
export function eligibleChanges(record: CommitRecord, rules: AggregationRules, filter: string, blobs: Map<string, BlobRecord>): FileChange[] {
  if (record.parents.length > 1) return [];
  return record.changes
    .filter((change) => !rules.ignored(change.path) && pathMatches(change.path, filter))
    .map((change) => {
      const excludedLines = ['120000', '160000'].includes(change.mode) || blobs.get(change.before)?.kind === 'lfs' || blobs.get(change.after)?.kind === 'lfs';
      return excludedLines ? { ...change, additions: 0, deletions: 0, binary: true } : change;
    });
}
function updateHotspot(rows: Map<string, MutableHotspot>, path: string, change: FileChange, record: CommitRecord, author: string, increment: boolean) {
  const row = rows.get(path) ?? {
    path,
    additions: 0,
    deletions: 0,
    changes: 0,
    authors: 0,
    lastChanged: 0,
    hash: record.hash,
    binary: false,
    people: new Set<string>(),
  };
  row.additions += change.additions;
  row.deletions += change.deletions;
  if (increment) row.changes++;
  row.people.add(author);
  row.authors = row.people.size;
  row.binary ||= change.binary;
  if (record.date >= row.lastChanged) {
    row.lastChanged = record.date;
    row.hash = record.hash;
    row.oldPath = change.oldPath;
  }
  rows.set(path, row);
}
function updatePeriod(rows: Map<string, AnalyticsPeriod>, date: string, record: CommitRecord, changes: FileChange[]) {
  const row = rows.get(date) ?? { date, commits: 0, merges: 0, additions: 0, deletions: 0 };
  row.commits++;
  row.merges += Number(record.parents.length > 1);
  row.additions += changes.reduce((sum, change) => sum + change.additions, 0);
  row.deletions += changes.reduce((sum, change) => sum + change.deletions, 0);
  rows.set(date, row);
}
function addPairs(paths: string[], pairs: Map<string, number>, frequency: Map<string, number>) {
  for (const path of paths) frequency.set(path, (frequency.get(path) ?? 0) + 1);
  for (let first = 0; first < paths.length; first++)
    for (let second = first + 1; second < paths.length; second++) {
      const key = `${paths[first]}\0${paths[second]}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
}
export async function aggregateAnalytics(
  records: CommitRecord[],
  rules: AggregationRules,
  filters: AnalyticsFilters,
  blobs: Map<string, BlobRecord>,
  signal?: AbortSignal,
) {
  const dates = records.map((record) => record.date);
  const firstActivity = dates.length ? dates.reduce((a, b) => Math.min(a, b)) : 0;
  const lastActivity = dates.length ? dates.reduce((a, b) => Math.max(a, b)) : 0;
  const totals = {
    commits: records.length,
    merges: records.filter((record) => record.parents.length > 1).length,
    contributors: new Set(records.map((record) => rules.author(record.author).id)).size,
    firstActivity,
    lastActivity,
  };
  const aggregation =
    filters.aggregation === 'auto'
      ? lastActivity - firstActivity > 365 * 86400000
        ? 'month'
        : lastActivity - firstActivity > 90 * 86400000
          ? 'week'
          : 'day'
      : filters.aggregation;
  const contributors = new Map<string, AnalyticsContribution & { paths: Set<string> }>();
  const hotspots = new Map<string, MutableHotspot>();
  const directories = new Map<string, MutableHotspot>();
  const periods = new Map<string, AnalyticsPeriod>();
  const calendar = new Map<string, AnalyticsPeriod>();
  const frequency = new Map<string, number>();
  const pairs = new Map<string, number>();
  let filteredCommits = 0;
  let excludedCouplingCommits = 0;
  for (let index = 0; index < records.length; index++) {
    if (index % 128 === 0) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      signal?.throwIfAborted();
    }
    const record = records[index];
    const author = rules.author(record.author);
    if (!dateMatches(record.date, filters.since, filters.until) || (filters.author && filters.author !== author.id)) continue;
    const changes = eligibleChanges(record, rules, filters.path, blobs);
    if (filters.path && !changes.length) continue;
    filteredCommits++;
    const person = contributors.get(author.id) ?? {
      ...author,
      commits: 0,
      merges: 0,
      files: 0,
      additions: 0,
      deletions: 0,
      lines: 0,
      paths: new Set<string>(),
    };
    person.commits++;
    person.merges += Number(record.parents.length > 1);
    const seenDirectories = new Set<string>();
    for (const change of changes) {
      person.paths.add(change.path);
      person.additions += change.additions;
      person.deletions += change.deletions;
      updateHotspot(hotspots, change.path, change, record, author.id, true);
      const parts = change.path.split('/');
      parts.pop();
      const parents = ['.', ...parts.map((_part, i) => parts.slice(0, i + 1).join('/'))];
      for (const parent of parents) {
        updateHotspot(directories, parent, change, record, author.id, !seenDirectories.has(parent));
        seenDirectories.add(parent);
      }
    }
    person.files = person.paths.size;
    contributors.set(author.id, person);
    updatePeriod(periods, bucket(record.date, aggregation), record, changes);
    updatePeriod(calendar, localDate(record.date), record, changes);
    const paths = [...new Set(changes.map((change) => change.path))].sort();
    if (paths.length > 50) excludedCouplingCommits++;
    else addPairs(paths, pairs, frequency);
  }
  const coupling: AnalyticsCoupling[] = [...pairs]
    .filter(([, commits]) => commits >= 3)
    .map(([key, commits]) => {
      const [first, second] = key.split('\0');
      return { first, second, commits, share: commits / ((frequency.get(first) ?? 0) + (frequency.get(second) ?? 0) - commits) };
    })
    .sort((a, b) => b.commits - a.commits || b.share - a.share);
  const cleanHotspots = (rows: Map<string, MutableHotspot>) =>
    [...rows.values()].map(({ people: _people, ...row }) => row).sort((a, b) => b.changes - a.changes || b.additions + b.deletions - a.additions - a.deletions);
  const people = [...contributors.values()].map(({ paths: _paths, ...person }) => person).sort((a, b) => b.commits - a.commits);
  return {
    totals,
    filteredCommits,
    excludedCouplingCommits,
    contributors: people,
    periods: [...periods.values()].sort((a, b) => a.date.localeCompare(b.date)),
    calendar: [...calendar.values()].sort((a, b) => a.date.localeCompare(b.date)),
    hotspots: cleanHotspots(hotspots),
    directories: cleanHotspots(directories),
    coupling,
    additions: people.reduce((sum, person) => sum + person.additions, 0),
    deletions: people.reduce((sum, person) => sum + person.deletions, 0),
  };
}
