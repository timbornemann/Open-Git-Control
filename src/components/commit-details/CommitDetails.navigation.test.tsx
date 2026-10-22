// @vitest-environment jsdom
import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/data/queryClient';
import { loadCommitOverview } from '@/data/commitDetails';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { IpcResult } from '@/types/ipc';
import { useMainViewInspector } from '@/components/layout/hooks/useMainViewInspector';
import { CommitDetails } from './CommitDetails';

const firstHash = 'a'.repeat(40),
  secondHash = 'b'.repeat(40),
  thirdHash = 'c'.repeat(40);
const files = new Map<string, string>();
const readCommit = vi.fn(async (hash: string): Promise<IpcResult<string>> => ({ success: true, data: files.get(hash) || '' }));
const openDiff = vi.fn();
const openWorkspace = vi.fn();
const historyEntry = (hash: string, path?: string) => ({
  hash,
  abbrevHash: hash.slice(0, 8),
  author: 'Author',
  date: '2026-10-22T10:00:00Z',
  subject: hash.slice(0, 8),
  path,
});
let root: Root, host: HTMLDivElement;
const node = (key: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-node-key]')].find((row) => row.dataset.nodeKey === key);
const click = (button: HTMLElement) => act(async () => button.click());
const clickHistory = (hash = secondHash) => click(host.querySelector<HTMLButtonElement>(`.file-history-entry[title="Open commit ${hash.slice(0, 8)}"]`)!);

function Harness({ repoPath }: { repoPath: string }) {
  const [hash, setHash] = useState<string | null>(firstHash);
  const [request, setRequest] = useState<{ hash: string; requestId: number } | null>(null);
  const navigate = useCallback((hash: string) => {
    setHash(hash);
    setRequest((current) => ({ hash, requestId: (current?.requestId ?? 0) + 1 }));
  }, []);
  const inspector = useMainViewInspector({
    activeRepo: repoPath,
    setSelectedCommit: setHash,
    onOpenRepoWorkspace: openWorkspace,
    commitNavigationRequest: request,
    onNavigateToCommit: navigate,
  });
  return (
    <I18nProvider language="en">
      <button onClick={() => navigate(thirdHash)}>Other commit</button>
      <button onClick={inspector.handleCommitBack}>Back</button>
      <CommitDetails
        repoPath={repoPath}
        hash={hash || ''}
        activeDiffRequest={inspector.activeDiffRequest}
        onSelectCommit={(target) => inspector.handleSelectCommitFromHistory(target, hash)}
        onOpenDiff={(request) => {
          openDiff(request);
          inspector.handleOpenDiff(request);
        }}
      />
      <output>{JSON.stringify(inspector.activeDiffRequest)}</output>
    </I18nProvider>
  );
}

const render = (repoPath = 'C:/repo') => act(async () => root.render(<Harness repoPath={repoPath} />));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient.clear();
  files.clear();
  files.set(firstHash, 'M\0src/file.ts\0');
  files.set(secondHash, 'M\0src/file.ts\0M\0other/file.ts\0');
  files.set(thirdHash, 'A\0unrelated.ts\0');
  readCommit.mockReset().mockImplementation(async (hash) => ({ success: true, data: files.get(hash) || '' }));
  openDiff.mockReset();
  openWorkspace.mockReset();
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, command, ...args) => {
    if (command === 'commitDetails') return readCommit(args[0]);
    if (args.includes('--format=%P')) return { success: true, data: 'd'.repeat(40) };
    return { success: true, data: 'Commit subject' };
  });
  vi.spyOn(gitClient, 'getFileHistory').mockResolvedValue({ success: true, data: [historyEntry(secondHash)] });
  vi.spyOn(gitClient, 'getFileBlameRange').mockResolvedValue({ success: true, data: [] });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  queryClient.clear();
});

describe('file history navigation', () => {
  it('restores the previous file and diff on Back without opening it twice', async () => {
    await render();
    await click(node('file:src/file.ts')!);
    await clickHistory();
    await click(node('file:other/file.ts')!);
    const opened = openDiff.mock.calls.length;
    await click([...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Back')!);
    expect(host.textContent).toContain('Commit details: aaaaaaaa');
    expect(node('file:src/file.ts')?.getAttribute('aria-current')).toBe('true');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toMatchObject({ path: 'src/file.ts', commitHash: firstHash });
    expect(openDiff).toHaveBeenCalledTimes(opened);
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Close file details"]')!);
    expect(host.querySelector('.commit-file-details')).toBeNull();
  });

  it('restores the correct historical path through multiple Back steps after renames', async () => {
    files.set(secondHash, 'M\0middle/file.ts\0');
    files.set(thirdHash, 'M\0old/file.ts\0');
    vi.mocked(gitClient.getFileHistory).mockImplementation(async (_path, hash) => ({
      success: true,
      data: [historyEntry(hash === firstHash ? secondHash : thirdHash, hash === firstHash ? 'middle/file.ts' : 'old/file.ts')],
    }));
    await render();
    await click(node('file:src/file.ts')!);
    await clickHistory();
    await clickHistory(thirdHash);
    const back = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Back')!;
    await click(back());
    expect(node('file:middle/file.ts')?.getAttribute('aria-current')).toBe('true');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toMatchObject({ path: 'middle/file.ts', commitHash: secondHash });
    await click(back());
    expect(node('file:src/file.ts')?.getAttribute('aria-current')).toBe('true');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toMatchObject({ path: 'src/file.ts', commitHash: firstHash });
  });

  it('keeps the restored diff when returning before the destination files have finished loading', async () => {
    let finish!: (result: IpcResult<string>) => void;
    const pending = new Promise<IpcResult<string>>((resolve) => {
      finish = resolve;
    });
    readCommit.mockImplementation(async (hash) => (hash === secondHash ? pending : { success: true, data: files.get(hash) || '' }));
    await render();
    await click(node('file:src/file.ts')!);
    await clickHistory();
    await click([...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Back')!);
    await act(async () => finish({ success: true, data: files.get(secondHash)! }));
    expect(node('file:src/file.ts')?.getAttribute('aria-current')).toBe('true');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toMatchObject({ path: 'src/file.ts', commitHash: firstHash });
    expect(openDiff).toHaveBeenCalledTimes(1);
  });

  it('keeps newer commits visible and opens their file diff from an older revision', async () => {
    vi.mocked(gitClient.getFileHistory).mockResolvedValue({
      success: true,
      data: [historyEntry(secondHash, 'src/file.ts'), historyEntry(firstHash, 'src/file.ts'), historyEntry(thirdHash, 'src/file.ts')],
    });
    await render();
    await click(node('file:src/file.ts')!);
    expect(host.querySelectorAll('.file-history-entry')).toHaveLength(3);
    expect(host.querySelector('.file-history-entry[aria-current="true"]')?.textContent).toContain('aaaaaaaa');
    await clickHistory();
    expect(node('file:src/file.ts')?.getAttribute('aria-current')).toBe('true');
    expect(host.querySelectorAll('.file-history-entry')).toHaveLength(3);
    expect(host.querySelector('.file-history-entry[aria-current="true"]')?.textContent).toContain('bbbbbbbb');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toMatchObject({ path: 'src/file.ts', commitHash: secondHash });
  });

  it('pins history pagination to the newest displayed revision and keeps all loaded commits selectable', async () => {
    const entries = Array.from({ length: 90 }, (_, index) => historyEntry((200 - index).toString(16).padStart(40, '0'), 'new/file.ts'));
    vi.mocked(gitClient.getFileHistory).mockImplementation(async (_path, _hash, _limit, _repo, options) => ({
      success: true,
      data: options?.includeFuture ? entries.slice(0, 81) : entries.slice(options?.offset ?? 0),
    }));
    await render();
    await click(node('file:src/file.ts')!);
    expect(host.querySelectorAll('.file-history-entry')).toHaveLength(80);
    await click(host.querySelector<HTMLButtonElement>('.file-history-panel__more')!);
    expect(gitClient.getFileHistory).toHaveBeenLastCalledWith('new/file.ts', entries[0].hash, 81, 'C:/repo', { offset: 80 });
    expect(host.querySelectorAll('.file-history-entry')).toHaveLength(90);
    expect(host.querySelector('.file-history-panel__more')).toBeNull();
  });

  it('opens the selected file even when the target commit is already cached', async () => {
    await loadCommitOverview('C:/repo', secondHash);
    await render();
    await click(node('file:src/file.ts')!);
    openDiff.mockClear();
    await clickHistory();
    expect(node('file:src/file.ts')?.getAttribute('aria-current')).toBe('true');
    expect(openDiff).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: 'src/file.ts', commitHash: secondHash }));
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toMatchObject({ path: 'src/file.ts', commitHash: secondHash });
  });

  it('waits for the target commit and opens the same exact file once after navigation clears the old diff', async () => {
    let finish!: (result: IpcResult<string>) => void;
    const pending = new Promise<IpcResult<string>>((resolve) => {
      finish = resolve;
    });
    readCommit.mockImplementation(async (hash) => (hash === secondHash ? pending : { success: true, data: files.get(hash) || '' }));
    await render();
    await click(node('file:src/file.ts')!);
    openDiff.mockClear();
    await clickHistory();
    expect(host.textContent).toContain('Commit details: bbbbbbbb');
    expect(host.querySelector('.commit-file-details')).toBeNull();
    expect(host.querySelector('output')?.textContent).toBe('null');
    expect(openDiff).not.toHaveBeenCalled();
    await act(async () => finish({ success: true, data: files.get(secondHash)! }));
    expect(node('file:src/file.ts')?.getAttribute('aria-current')).toBe('true');
    expect(node('file:other/file.ts')?.hasAttribute('aria-current')).toBe(false);
    expect(host.querySelector('.commit-file-details__identity')?.getAttribute('title')).toBe('src/file.ts');
    expect(openDiff).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: 'commit', path: 'src/file.ts', commitHash: secondHash }));
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toMatchObject({ path: 'src/file.ts', commitHash: secondHash });
    await render();
    expect(openDiff).toHaveBeenCalledTimes(1);
  });

  it('selects historical paths across a chain of renames and preserves unusual filename characters', async () => {
    const oldPath = 'old/ leading\tfile\\name.ts';
    const oldestPath = 'original/file.ts';
    files.set(secondHash, `R100\0${oldestPath}\0${oldPath}\0M\0other/file.ts\0`);
    files.set(thirdHash, `A\0${oldestPath}\0`);
    vi.mocked(gitClient.getFileHistory).mockImplementation(async (_path, hash) => ({
      success: true,
      data: [historyEntry(hash === firstHash ? secondHash : thirdHash, hash === firstHash ? oldPath : oldestPath)],
    }));
    await render();
    await click(node('file:src/file.ts')!);
    await clickHistory();
    expect(node(`file:${oldPath}`)?.getAttribute('aria-current')).toBe('true');
    expect(openDiff).toHaveBeenLastCalledWith(expect.objectContaining({ path: oldPath, commitHash: secondHash }));
    expect(gitClient.getFileHistory).toHaveBeenCalledWith(oldPath, secondHash, 81, 'C:/repo', { includeFuture: true });
    await clickHistory(thirdHash);
    expect(node(`file:${oldestPath}`)?.getAttribute('aria-current')).toBe('true');
    expect(openDiff).toHaveBeenLastCalledWith(expect.objectContaining({ path: oldestPath, commitHash: thirdHash }));
    expect(openDiff).toHaveBeenCalledTimes(3);
  });

  it('reveals the selected file in a large virtualized target tree without taking keyboard focus', async () => {
    const paths = Array.from({ length: 5000 }, (_, index) => `src/file-${String(index).padStart(5, '0')}.ts`);
    files.set(secondHash, paths.map((path) => `M\0${path}\0`).join(''));
    vi.mocked(gitClient.getFileHistory).mockResolvedValue({ success: true, data: [historyEntry(secondHash, paths[4000])] });
    await render();
    await click(node('file:src/file.ts')!);
    await clickHistory();
    expect(node(`file:${paths[4000]}`)?.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).not.toBe(node(`file:${paths[4000]}`));
    const list = host.querySelector<HTMLElement>('.working-tree-list')!;
    expect(list.scrollTop).toBeGreaterThan(0);
    act(() => {
      list.scrollTop = 0;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(list.scrollTop).toBe(0);
    expect(host.querySelectorAll('[data-node-key]').length).toBeLessThan(100);
  });

  it.each(['repository', 'commit'])('drops a pending selection after changing the %s while the target loads', async (destination) => {
    let finish!: (result: IpcResult<string>) => void;
    const pending = new Promise<IpcResult<string>>((resolve) => {
      finish = resolve;
    });
    readCommit.mockImplementation(async (hash) => (hash === secondHash ? pending : { success: true, data: files.get(hash) || '' }));
    await render();
    await click(node('file:src/file.ts')!);
    openDiff.mockClear();
    await clickHistory();
    if (destination === 'repository') await render('C:/other-repo');
    else await click([...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Other commit')!);
    await act(async () => finish({ success: true, data: files.get(secondHash)! }));
    expect(host.querySelector('.commit-file-details')).toBeNull();
    expect(openDiff).not.toHaveBeenCalled();
    expect(host.querySelector('output')?.textContent).toBe('null');
  });

  it('does not select an unrelated file when the destination has no matching changed path', async () => {
    files.set(secondHash, 'M\0other/file.ts\0');
    await render();
    await click(node('file:src/file.ts')!);
    openDiff.mockClear();
    await clickHistory();
    expect(node('file:other/file.ts')).toBeDefined();
    expect(host.querySelector('.commit-file-details')).toBeNull();
    expect(openDiff).not.toHaveBeenCalled();
  });

  it('keeps destination load errors visible without reopening the previous diff', async () => {
    readCommit.mockImplementation(async (hash) =>
      hash === secondHash ? { success: false, error: 'Commit files unavailable' } : { success: true, data: files.get(hash) || '' },
    );
    await render();
    await click(node('file:src/file.ts')!);
    openDiff.mockClear();
    await clickHistory();
    expect(host.querySelector('.commit-details-error')?.textContent).toBe('Commit files unavailable');
    expect(host.querySelector('.commit-file-details')).toBeNull();
    expect(openDiff).not.toHaveBeenCalled();
    expect(host.querySelector('output')?.textContent).toBe('null');
  });
});
