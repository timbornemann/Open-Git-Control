import { afterEach, expect, it, vi } from 'vitest';
import { cachedClient, preload, setGithubResourceScope, resourceKey } from '../clientCache';
import { readResource } from '../queryClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('yields between branch pages so a visible GitHub request can overtake background pagination', async () => {
  let finishFirst!: (result: { success: true; data: string[] }) => void;
  const order: string[] = [];
  const page = vi.fn((_owner: string, _repo: string, number: number) => {
    order.push(`page-${number}`);
    return number === 1
      ? new Promise<{ success: true; data: string[] }>((resolve) => {
          finishFirst = resolve;
        })
      : Promise.resolve({ success: true as const, data: ['last'] });
  });
  vi.stubGlobal('window', { electronAPI: { github: { githubGetBranchesPage: page } } });
  setGithubResourceScope('github.com', 'alice');
  const fallback = vi.fn(async (_owner: string, _repo: string) => ({ success: true, data: [] as string[] }));
  const client = cachedClient('github', { getBranches: fallback });
  const branches = preload(() => client.getBranches('org', 'repo'), 'startup');
  await Promise.resolve();
  await Promise.resolve();
  const visible = readResource(resourceKey('github', 'getRepository', ['org', 'other']), async () => {
    order.push('visible');
    return {};
  });
  finishFirst({ success: true, data: Array.from({ length: 100 }, (_, index) => `branch-${index}`) });
  const [result] = await Promise.all([branches, visible]);
  expect(result?.data).toHaveLength(101);
  expect(order).toEqual(['page-1', 'visible', 'page-2']);
  expect(fallback).not.toHaveBeenCalled();
  await client.getBranches('org', 'repo');
  expect(page).toHaveBeenCalledTimes(2);
});
