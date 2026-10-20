import type { HostingProvider } from '../../src/types/hostingDtos';
import type { HostingHttpTransport, HostingHttpRequest } from './providers/HostingHttpTransport';

export type CleanupRow = Record<string, unknown>;
export const cleanupObject = (value: unknown): CleanupRow => (value && typeof value === 'object' && !Array.isArray(value) ? (value as CleanupRow) : {});
export const cleanupString = (value: unknown): string => (typeof value === 'string' ? value : '');

function nextCleanupPage(provider: HostingProvider, data: CleanupRow, headers: Headers, count: number, totalCount: number, page: number, start: number) {
  if (provider === 'bitbucket-cloud') {
    if (data.next !== undefined && data.next !== null && typeof data.next !== 'string') throw new Error('Invalid hosting pagination.');
    const next = cleanupString(data.next);
    if (!next && typeof data.size === 'number' && data.size !== totalCount) throw new Error('Incomplete hosting inventory.');
    return { next, start };
  }
  if (provider === 'bitbucket-data-center') {
    if (typeof data.isLastPage !== 'boolean') throw new Error('Incomplete hosting pagination.');
    if (data.isLastPage) return { next: '', start };
    if (!Number.isInteger(data.nextPageStart) || Number(data.nextPageStart) <= start) throw new Error('Invalid hosting pagination.');
    return { next: `start:${data.nextPageStart}`, start: Number(data.nextPageStart) };
  }
  const link = headers.get('link');
  let next = /<([^>]+)>;\s*rel="next"/.exec(link || '')?.[1] ?? '';
  if (provider === 'forgejo' && !next && !link) {
    const total = headers.get('x-total-count');
    if (total === null || !/^\d+$/.test(total)) throw new Error('Forgejo did not return a complete branch inventory count.');
    if (totalCount < Number(total)) next = `page:${page + 1}`;
    else if (totalCount !== Number(total)) throw new Error('Hosting inventory changed while listing.');
  } else if (!link && count === 100) next = `page:${page + 1}`;
  return { next, start };
}

/** Empty/malformed pages and pagination loops must never prove that a branch is unprotected. */
export async function readCleanupPages(
  http: HostingHttpTransport,
  route: string,
  provider: HostingProvider,
  query: HostingHttpRequest['query'],
  signal?: AbortSignal,
  maxPages = 100,
): Promise<CleanupRow[]> {
  const result: CleanupRow[] = [];
  const seen = new Set<string>();
  let cursor = '';
  let start = 0;
  for (let page = 1; page <= maxPages; page++) {
    signal?.throwIfAborted();
    const pagedQuery =
      provider === 'bitbucket-cloud'
        ? { pagelen: 100 }
        : provider === 'bitbucket-data-center'
          ? { limit: 100, start }
          : provider === 'forgejo'
            ? { limit: 50, page }
            : { per_page: 100, page };
    const response = await http.json(cursor || route, { signal, query: cursor ? undefined : { ...pagedQuery, ...query } });
    const data = cleanupObject(response.data);
    const values = ['bitbucket-cloud', 'bitbucket-data-center'].includes(provider) ? data.values : response.data;
    if (!Array.isArray(values) || values.some((value) => !value || typeof value !== 'object' || Array.isArray(value)))
      throw new Error('Incomplete hosting inventory.');
    result.push(...(values as CleanupRow[]));
    const pagination = nextCleanupPage(provider, data, response.headers, values.length, result.length, page, start);
    const next = pagination.next;
    start = pagination.start;
    if (!next) return result;
    if (!values.length || seen.has(next)) throw new Error('Hosting pagination did not advance.');
    seen.add(next);
    cursor = next.startsWith('page:') || next.startsWith('start:') ? '' : next;
  }
  throw new Error('Hosting inventory exceeds the complete-list limit.');
}
