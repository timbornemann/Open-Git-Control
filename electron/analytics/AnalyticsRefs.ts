import type { AnalyticsFilters, AnalyticsTag } from '../../src/shared/ipc/repositoryAnalytics';
import type { AnalyticsGit } from './AnalyticsGit';

export async function captureAnalyticsRefs(git: AnalyticsGit) {
  const raw = await git.text([
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(*objectname)%00%(creatordate:unix)',
    'refs/heads',
    'refs/remotes',
    'refs/tags',
  ]);
  const refs: { name: string; oid: string; remote: boolean }[] = [];
  const tags: AnalyticsTag[] = [];
  for (const line of raw.trimEnd().split(/\r?\n/).filter(Boolean)) {
    const [name, oid, peeled, date] = line.split('\0');
    if (name.startsWith('refs/tags/')) {
      const label = name.slice(10);
      tags.push({
        name: label,
        oid: peeled || oid,
        date: Number(date) * 1000,
        version: /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(label),
      });
    } else if (!name.endsWith('/HEAD')) refs.push({ name, oid, remote: name.startsWith('refs/remotes/') });
  }
  let head = '';
  try {
    head = (await git.text(['rev-parse', '--verify', '--quiet', 'HEAD'])).trim();
  } catch (error) {
    git.signal.throwIfAborted();
    if (!/failed \(1\)/.test(String(error))) throw error;
  }
  return { refs, tags: tags.sort((a, b) => b.date - a.date), head };
}
export function resolveAnalyticsRevision(value: string, captured: Awaited<ReturnType<typeof captureAnalyticsRefs>>): string {
  if (value === 'HEAD') return captured.head;
  const found =
    captured.refs.find((ref) => ref.name === value || ref.name.replace(/^refs\/(heads|remotes)\//, '') === value)?.oid ??
    captured.tags.find((tag) => tag.name === value || `refs/tags/${tag.name}` === value)?.oid;
  if (found) return found;
  if (/^[a-f0-9]{40,64}$/.test(value)) return value;
  throw new Error('The selected analytics revision is no longer available.');
}
export function resolveAnalyticsComparisonBase(value: string, captured: Awaited<ReturnType<typeof captureAnalyticsRefs>>, automatic?: AnalyticsTag): string {
  return value ? resolveAnalyticsRevision(value, captured) : automatic?.oid || '';
}
export function validateAnalyticsFilters(value: AnalyticsFilters): AnalyticsFilters {
  if (!value || typeof value !== 'object') throw new Error('Analytics filters are required.');
  for (const key of ['scope', 'revision', 'since', 'until', 'author', 'path', 'compareFrom', 'compareTo'] as const) {
    if (typeof value[key] !== 'string' || value[key].length > 4096 || value[key].includes('\0')) throw new Error('Invalid analytics filter.');
  }
  for (const date of [value.since, value.until])
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(date).getTime()))) throw new Error('Invalid analytics date.');
  if (value.since && value.until && value.since > value.until) throw new Error('The start date must precede the end date.');
  if (!['auto', 'day', 'week', 'month'].includes(value.aggregation)) throw new Error('Invalid analytics aggregation.');
  return { ...value };
}
