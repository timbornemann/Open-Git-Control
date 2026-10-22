// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { CommitDetails } from './CommitDetails';

let root: Root, host: HTMLDivElement;
const firstHash = 'a'.repeat(40),
  secondHash = 'b'.repeat(40);
const onOpenDiff = vi.fn();
const node = (key: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-node-key]')].find((button) => button.dataset.nodeKey === key);
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === label)!;
const render = (hash = firstHash, repoPath = 'C:/repos/project') =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <CommitDetails repoPath={repoPath} hash={hash} onOpenDiff={onOpenDiff} />
      </I18nProvider>,
    ),
  );
const click = (element: HTMLElement) => act(async () => element.click());

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onOpenDiff.mockReset();
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, command, ...args) => {
    if (command === 'commitDetails') return { success: true, data: 'M\0src/app/index.ts\0A\0README.md\0D\0old.txt\0' };
    if (args.includes('--format=%P')) return { success: true, data: 'c'.repeat(40) };
    return { success: true, data: 'Commit subject\n\nDescription stays visible.' };
  });
  vi.spyOn(gitClient, 'getFileHistory').mockResolvedValue({ success: true, data: [] });
  vi.spyOn(gitClient, 'getFileBlameRange').mockResolvedValue({ success: true, data: [] });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('historical commit file tree integration', () => {
  it('retains folder choices on return from details and resets on commit or repository changes', async () => {
    await render();
    expect(node('directory:src')?.getAttribute('aria-expanded')).toBe('true');
    expect(node('directory:src/app')?.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Description stays visible.');
    await click(node('directory:src')!);
    expect(node('directory:src')?.getAttribute('aria-expanded')).toBe('false');
    await click(node('file:README.md')!);
    expect(host.querySelector('.commit-file-tree')).toBeNull();
    expect(gitClient.getFileHistory).toHaveBeenCalledWith('README.md', firstHash, 80, 'C:/repos/project');
    await click(button('Files'));
    expect(node('directory:src')?.getAttribute('aria-expanded')).toBe('false');
    expect(node('file:src/app/index.ts')).toBeUndefined();

    await render(secondHash);
    expect(node('directory:src')?.getAttribute('aria-expanded')).toBe('true');
    expect(node('file:src/app/index.ts')).toBeDefined();
    await click(node('directory:src/app')!);
    await render(secondHash, 'C:/repos/other');
    expect(node('directory:src/app')?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.working-tree-root__label')?.textContent).toBe('other/');
    await click(node('directory:src')!);
    await render(firstHash);
    expect(node('directory:src')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps file history, blame and patch tied to the original historical path and hash', async () => {
    const path = 'new/ leading name\twith\\slash.ts';
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(async (_repo, command, ...args) => {
      if (command === 'commitDetails') return { success: true, data: `R100\0old/file.ts\0${path}\0` };
      if (args.includes('--format=%P')) return { success: true, data: 'c'.repeat(40) };
      return { success: true, data: 'Rename file' };
    });
    await render();
    await click(node(`file:${path}`)!);
    expect(gitClient.getFileHistory).toHaveBeenCalledWith(path, firstHash, 80, 'C:/repos/project');
    await click(button('Blame'));
    expect(gitClient.getFileBlameRange).toHaveBeenCalledWith(path, firstHash, 1, expect.any(Number), 'C:/repos/project');
    await click(button('Patch'));
    expect(onOpenDiff).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: 'commit', path, commitHash: firstHash }));
    await click(button('Files'));
    expect(node(`file:${path}`)?.title).toBe(`old/file.ts → ${path}`);
  });

  it('still shows merge source hints above the tree', async () => {
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(async (_repo, command, ...args) => {
      if (command === 'commitDetails') return { success: true, data: '' };
      if (command === 'diff') return { success: true, data: 'M\0src/merged.ts\0' };
      if (args.includes('--format=%P')) return { success: true, data: `${firstHash} ${secondHash}` };
      return { success: true, data: 'Merge branch' };
    });
    await render();
    expect(host.textContent).toContain('Files show the effective changes from the merged branch (against parent 1).');
    expect(node('file:src/merged.ts')).toBeDefined();
  });

  it('retains loading, error, empty and invalid-commit states', async () => {
    let finish!: (value: { success: false; error: string }) => void;
    const pending = new Promise<{ success: false; error: string }>((resolve) => {
      finish = resolve;
    });
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(() => pending);
    await render();
    expect(host.textContent).toContain('Loading details');
    expect(host.querySelector('.commit-file-tree')).toBeNull();
    await act(async () => finish({ success: false, error: 'Could not load commit files.' }));
    expect(host.textContent).toContain('Could not load commit files.');
    expect(host.querySelector('.commit-file-tree')).toBeNull();
    vi.mocked(gitClient.runGitCommandForRepo).mockResolvedValue({ success: true, data: '' });
    await render(secondHash);
    expect(host.textContent).toContain('No files changed');
    expect(host.querySelector('.commit-file-tree')).toBeNull();
    await render('not-a-hash');
    expect(host.textContent).toContain('Invalid commit ID');
    expect(host.querySelector('.commit-file-tree')).toBeNull();
  });
});
