// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import * as clipboard from '@/utils/clipboard';
import { CommitDetails } from './CommitDetails';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => showToast }));

let root: Root, host: HTMLDivElement;
const firstHash = 'a'.repeat(40),
  secondHash = 'b'.repeat(40);
const onOpenDiff = vi.fn();
const onSelectCommit = vi.fn();
const node = (key: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-node-key]')].find((button) => button.dataset.nodeKey === key);
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === label)!;
const render = (hash = firstHash, repoPath = 'C:/repos/project', language: 'en' | 'de' = 'en') =>
  act(async () =>
    root.render(
      <I18nProvider language={language}>
        <CommitDetails repoPath={repoPath} hash={hash} onOpenDiff={onOpenDiff} onSelectCommit={onSelectCommit} />
      </I18nProvider>,
    ),
  );
const click = (element: HTMLElement) => act(async () => element.click());

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onOpenDiff.mockReset();
  onSelectCommit.mockReset();
  showToast.mockReset();
  vi.spyOn(clipboard, 'copyTextToClipboard').mockResolvedValue(true);
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
  it('keeps the tree visible with file details and resets folders on commit or repository changes', async () => {
    await render();
    expect(node('directory:src')?.getAttribute('aria-expanded')).toBe('true');
    expect(node('directory:src/app')?.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Description stays visible.');
    await click(node('directory:src')!);
    expect(node('directory:src')?.getAttribute('aria-expanded')).toBe('false');
    const tree = host.querySelector('.commit-file-tree');
    await click(node('file:README.md')!);
    expect(host.querySelector('.commit-file-tree')).toBe(tree);
    const content = host.querySelector('.commit-details-content')!;
    expect(content.classList.contains('has-selection')).toBe(true);
    expect(content.firstElementChild).toBe(host.querySelector('.commit-file-details'));
    expect(content.lastElementChild).toBe(host.querySelector('.commit-details-files'));
    expect(node('file:README.md')?.classList.contains('working-tree-row--selected')).toBe(true);
    expect(node('file:README.md')?.getAttribute('aria-current')).toBe('true');
    expect(onOpenDiff).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: 'commit', path: 'README.md', commitHash: firstHash }));
    expect(host.querySelector('.commit-file-details__name')?.textContent).toBe('README.md');
    expect(host.querySelector('.commit-file-details__path')?.textContent).toBe('Repository root');
    expect(host.querySelector('.commit-file-details__status')?.textContent).toBe('Added');
    expect([...host.querySelectorAll('.commit-file-details__tab')].map((tab) => tab.textContent)).toEqual(['History', 'Blame']);
    expect(gitClient.getFileHistory).toHaveBeenCalledWith('README.md', firstHash, 80, 'C:/repos/project');
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Close file details"]')!);
    expect(host.querySelector('.commit-file-details')).toBeNull();
    expect(content.children).toHaveLength(1);
    expect(content.classList.contains('has-selection')).toBe(false);
    expect(host.querySelector('.commit-file-tree')).toBe(tree);
    expect(node('file:README.md')?.getAttribute('aria-current')).toBeNull();
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

  it('switches files directly without remounting or scrolling the virtualized tree', async () => {
    const files = Array.from({ length: 5000 }, (_, index) => `src/file-${String(index).padStart(5, '0')}.ts`);
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(async (_repo, command) => ({
      success: true,
      data: command === 'commitDetails' ? files.map((path) => `M\0${path}\0`).join('') : '',
    }));
    await render();
    const list = host.querySelector<HTMLElement>('.working-tree-list')!;
    act(() => {
      list.scrollTop = 4001 * 25;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await click(node(`file:${files[4000]}`)!);
    expect(host.querySelector('.working-tree-list')).toBe(list);
    expect(list.scrollTop).toBe(4001 * 25);
    expect(node(`file:${files[4000]}`)?.getAttribute('aria-current')).toBe('true');
    const details = host.querySelector<HTMLElement>('.commit-file-details')!;
    const detailContent = details.querySelector<HTMLElement>('.commit-file-details__content')!;
    detailContent.scrollTop = 200;
    await click(node(`file:${files[4001]}`)!);
    expect(host.querySelector('.working-tree-list')).toBe(list);
    expect(list.scrollTop).toBe(4001 * 25);
    expect(detailContent.scrollTop).toBe(0);
    expect(node(`file:${files[4000]}`)?.hasAttribute('aria-current')).toBe(false);
    expect(node(`file:${files[4001]}`)?.getAttribute('aria-current')).toBe('true');
    expect(details.querySelector('.commit-file-details__identity')?.getAttribute('title')).toBe(files[4001]);
    expect(onOpenDiff).toHaveBeenCalledTimes(2);
    expect(onOpenDiff).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'commit', path: files[4001], commitHash: firstHash }));
    expect(host.querySelectorAll('[data-node-key]').length).toBeLessThan(100);
    await click(button('Blame'));
    expect(onOpenDiff).toHaveBeenCalledTimes(2);
    await click(node(`file:${files[4002]}`)!);
    expect(onOpenDiff).toHaveBeenCalledTimes(3);
    expect(onOpenDiff).toHaveBeenLastCalledWith(expect.objectContaining({ path: files[4002] }));
  });

  it('keeps history, blame, clipboard and file actions tied to the original historical path and hash', async () => {
    const path = 'new/ leading name\twith\\slash.ts';
    vi.mocked(gitClient.runGitCommandForRepo).mockImplementation(async (_repo, command, ...args) => {
      if (command === 'commitDetails') return { success: true, data: `R100\0old/file.ts\0${path}\0` };
      if (args.includes('--format=%P')) return { success: true, data: 'c'.repeat(40) };
      return { success: true, data: 'Rename file' };
    });
    await render();
    await click(node(`file:${path}`)!);
    expect(host.querySelector('.commit-file-details__name')?.textContent).toBe(' leading name\twith\\slash.ts');
    expect(host.querySelector('.commit-file-details__path')?.textContent).toBe('new');
    expect(host.querySelector('.commit-file-details__previous-path')?.textContent).toContain('old/file.ts');
    expect(host.querySelector('.commit-file-details__status')?.textContent).toBe('Renamed');
    expect(onOpenDiff).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: 'commit', path, commitHash: firstHash }));
    expect(gitClient.getFileHistory).toHaveBeenCalledWith(path, firstHash, 80, 'C:/repos/project');
    onOpenDiff.mockClear();
    await click(button('Blame'));
    expect(gitClient.getFileBlameRange).toHaveBeenCalledWith(path, firstHash, 1, expect.any(Number), 'C:/repos/project');
    await click(button('History'));
    expect(onOpenDiff).not.toHaveBeenCalled();
    await click(node(`file:${path}`)!);
    expect(onOpenDiff).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: 'commit', path, commitHash: firstHash }));
    expect(node(`file:${path}`)?.title).toBe(`old/file.ts → ${path}`);

    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Copy file path"]')!);
    expect(clipboard.copyTextToClipboard).toHaveBeenCalledExactlyOnceWith(path);
    expect(showToast).toHaveBeenLastCalledWith('File path copied.', false);
    vi.mocked(clipboard.copyTextToClipboard).mockResolvedValue(false);
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="Copy file path"]')!);
    expect(showToast).toHaveBeenLastCalledWith('Could not copy the file path.', true);

    const open = vi.spyOn(gitClient, 'openRepositoryPath').mockResolvedValue({ success: true });
    for (const [label, action] of [
      ['Show in folder', 'reveal'],
      ['Open', 'open'],
      ['Open with…', 'openWith'],
    ] as const) {
      await click(button(label));
      expect(open).toHaveBeenLastCalledWith({ path, action, repoPath: 'C:/repos/project' });
    }
    open.mockResolvedValue({ success: false, error: 'File no longer exists' });
    await click(button('Open'));
    expect(showToast).toHaveBeenLastCalledWith('File no longer exists', true);
  });

  it('opens commits from history and blame without reopening the diff when switching views', async () => {
    const date = '2026-10-21T13:45:00Z';
    vi.mocked(gitClient.getFileHistory).mockResolvedValue({
      success: true,
      data: [{ hash: firstHash, abbrevHash: 'aaaaaaaa', author: 'Author', date, subject: 'Update selected file' }],
    });
    vi.mocked(gitClient.getFileBlameRange).mockResolvedValue({
      success: true,
      data: [
        {
          lineNumber: 1,
          commitHash: secondHash,
          abbrevHash: 'bbbbbbbb',
          author: 'Other author',
          authorTime: date,
          summary: 'Original change',
          content: 'const value = 1;',
        },
      ],
    });
    await render();
    await click(node('file:README.md')!);
    const historyEntry = host.querySelector<HTMLButtonElement>('.file-history-entry')!;
    expect(historyEntry.getAttribute('aria-current')).toBe('true');
    expect(historyEntry.textContent).toContain('Selected');
    expect(historyEntry.querySelector('time')?.getAttribute('datetime')).toBe(date);
    await click(historyEntry);
    expect(onSelectCommit).toHaveBeenLastCalledWith(firstHash);
    await click(button('Blame'));
    expect(button('Blame').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.file-blame-line__author')?.textContent).toBe('Other author');
    expect(host.querySelector('.file-blame-line__content')?.textContent).toBe('const value = 1;');
    await click(host.querySelector<HTMLButtonElement>('.file-blame-line__commit')!);
    expect(onSelectCommit).toHaveBeenLastCalledWith(secondHash);
    await click(button('History'));
    expect(onOpenDiff).toHaveBeenCalledTimes(1);
  });

  it('localizes file details and keeps deleted-file blame protection', async () => {
    await render(firstHash, 'C:/repos/project', 'de');
    await click(node('file:old.txt')!);
    expect(host.querySelector('.commit-file-details__status')?.textContent).toBe('Gelöscht');
    expect(host.querySelector('.commit-file-details__path')?.textContent).toBe('Repository-Stamm');
    expect(host.querySelector('button[aria-label="Dateipfad kopieren"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Dateidetails schließen"]')).not.toBeNull();
    expect([...host.querySelectorAll('.commit-file-details__tab')].map((tab) => tab.textContent)).toEqual(['Historie', 'Blame']);
    await click(button('Blame'));
    expect(gitClient.getFileBlameRange).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('gelöschte Dateien');
    expect(host.querySelector('.commit-file-tree')).not.toBeNull();
  });

  it('loads more blame lines into the details scroll area without changing the selected file or diff', async () => {
    const lines = Array.from({ length: 501 }, (_, index) => ({
      lineNumber: index + 1,
      commitHash: firstHash,
      abbrevHash: 'aaaaaaaa',
      author: 'Author',
      authorTime: '2026-10-21T13:45:00Z',
      summary: 'Original change',
      content: `line ${index + 1}`,
    }));
    vi.mocked(gitClient.getFileBlameRange).mockImplementation(async (_path, _hash, startLine) => ({
      success: true,
      data: startLine === 1 ? lines : [lines[500]],
    }));
    await render();
    await click(node('file:README.md')!);
    const tree = host.querySelector('.commit-file-tree');
    await click(button('Blame'));
    expect(host.querySelectorAll('.file-blame-line')).toHaveLength(500);
    await click(host.querySelector<HTMLButtonElement>('.file-blame-panel__more')!);
    expect(gitClient.getFileBlameRange).toHaveBeenLastCalledWith('README.md', firstHash, 501, 501, 'C:/repos/project');
    expect(host.querySelectorAll('.file-blame-line')).toHaveLength(501);
    expect(host.querySelector('.file-blame-panel__more')).toBeNull();
    expect(host.querySelector('.commit-file-tree')).toBe(tree);
    expect(node('file:README.md')?.getAttribute('aria-current')).toBe('true');
    expect(onOpenDiff).toHaveBeenCalledTimes(1);
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
