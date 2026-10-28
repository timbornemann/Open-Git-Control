// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { StagingFileSections } from '../StagingFileSections';
import { StagingToolbar } from '../StagingToolbar';
import { useFileOperations } from '../useFileOperations';

const repo = 'C:/staging-filter';
type Params = Parameters<typeof useFileOperations>[0];
const entry = (path: string, x = ' ', y = 'M') => ({ path, x, y });
const status = {
  staged: [entry('feature/renamed.ts', 'R', ' '), entry('hidden/staged.ts', 'A', ' ')],
  unstaged: [entry('src/feature/edit.ts'), entry('docs/feature notes.md', ' ', 'D'), entry('hidden/edit.ts'), entry('hidden/deleted.ts', ' ', 'D')],
  untracked: [entry('feature/new [demo].txt', '?', '?'), entry('src/feature/new.ts', '?', '?'), entry('hidden/new.ts', '?', '?')],
};

describe('staging bulk actions and search scope', () => {
  let root: Root;
  let host: HTMLDivElement;
  let fileOps: ReturnType<typeof useFileOperations>;
  let params: Params;
  function Harness() {
    fileOps = useFileOperations(params);
    const { visibleFiles } = fileOps;
    return (
      <>
        <StagingToolbar
          searchQuery={fileOps.searchQuery}
          setSearchQuery={fileOps.setSearchQuery}
          onStageAll={fileOps.stageAll}
          canStageAll={
            !fileOps.isMutating &&
            !fileOps.status?.conflicts.length &&
            Boolean(fileOps.status && fileOps.status.unstaged.length + fileOps.status.untracked.length)
          }
          hasConflicts={Boolean(fileOps.status?.conflicts.length)}
        />
        <StagingFileSections
          visibleStaged={visibleFiles.staged}
          visibleUnstaged={visibleFiles.unstaged}
          visibleUntracked={visibleFiles.untracked}
          fileOps={fileOps}
        />
      </>
    );
  }
  const render = () =>
    act(async () =>
      root.render(
        <I18nProvider language="en">
          <Harness />
        </I18nProvider>,
      ),
    );
  const search = async (query: string) => {
    await act(async () => fileOps.setSearchQuery(query));
  };
  const clickSection = async (section: number) => {
    const button = host.querySelectorAll('.staging-section')[section].querySelector<HTMLButtonElement>('.staging-section-header button')!;
    await act(async () => button.click());
  };
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'getGitLfsStatus').mockResolvedValue({ success: true, data: { available: false, files: [] } });
    vi.spyOn(gitClient, 'stagePaths').mockResolvedValue({ success: true, data: '' });
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: `# branch.oid ${'a'.repeat(40)}\n# branch.head main` });
    params = {
      repoPath: repo,
      externalRepoPath: repo,
      externalStatus: status,
      externalStatusRaw: '',
      externalStats: null,
      externalRefresh: vi.fn(async () => {}),
      setConfirmDialog: vi.fn(),
      setInputDialog: vi.fn(),
      setToast: vi.fn(),
    };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await render();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it.each(['feature', '  FEATURE  '])('adds only the displayed tracked changes for search %j in a single batch', async (query) => {
    await search(query);
    await clickSection(1);
    expect(gitClient.stagePaths).toHaveBeenCalledExactlyOnceWith(['docs/feature notes.md', 'src/feature/edit.ts'], repo);
  });

  it('adds only displayed new files while preserving literal file names', async () => {
    await search('feature');
    await clickSection(2);
    expect(gitClient.stagePaths).toHaveBeenCalledExactlyOnceWith(['feature/new [demo].txt', 'src/feature/new.ts'], repo);
  });

  it('uses the full path to filter both sections and restores all entries when the search is cleared', async () => {
    await search('src/feature/');
    expect(host.querySelectorAll('.staging-file-row')).toHaveLength(2);
    await act(async () => {
      await fileOps.stageAllUnstaged();
      await fileOps.stageAllUntracked();
    });
    expect(gitClient.stagePaths).toHaveBeenNthCalledWith(1, ['src/feature/edit.ts'], repo);
    expect(gitClient.stagePaths).toHaveBeenNthCalledWith(2, ['src/feature/new.ts'], repo);
    vi.mocked(gitClient.stagePaths).mockClear();
    await search('   ');
    await act(async () => {
      await fileOps.stageAllUntracked();
    });
    expect(gitClient.stagePaths).toHaveBeenCalledExactlyOnceWith(
      status.untracked.map((file) => file.path),
      repo,
    );
  });

  it('does not send an empty or repository-wide operation when the filter has no matches', async () => {
    await search('missing/file.txt');
    expect(host.querySelectorAll('.staging-file-row')).toHaveLength(0);
    await act(async () => {
      await fileOps.stageAllUnstaged();
      await fileOps.stageAllUntracked();
      await fileOps.unstageAll();
    });
    expect(gitClient.stagePaths).not.toHaveBeenCalled();
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalled();
  });

  it.each(['', 'feature', 'missing/file.txt'])('stages the whole repository with one command using the explicit global button (search %j)', async (query) => {
    await search(query);
    const button = host.querySelector<HTMLButtonElement>('.staging-stage-all')!;
    expect(button.textContent).toBe('Stage whole repository');
    expect(button.title).toContain('hidden by the search filter');
    await act(async () => button.click());
    expect(gitClient.runGitCommandForRepo).toHaveBeenCalledExactlyOnceWith(repo, 'add', '-A');
    expect(gitClient.stagePaths).not.toHaveBeenCalled();
    expect(params.externalRefresh).toHaveBeenCalledOnce();
  });

  it('prevents a second global staging operation until the first one finishes', async () => {
    let finish!: (value: { success: true; data: string }) => void;
    vi.mocked(gitClient.runGitCommandForRepo).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const button = host.querySelector<HTMLButtonElement>('.staging-stage-all')!;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(gitClient.runGitCommandForRepo).toHaveBeenCalledExactlyOnceWith(repo, 'add', '-A');
    expect(button.disabled).toBe(true);
    await act(async () => {
      finish({ success: true, data: '' });
    });
    expect(button.disabled).toBe(false);
  });

  it('disables global staging when conflicts are present without blocking filtered ordinary files', async () => {
    params = { ...params, externalStatusRaw: 'UU feature/conflict.ts\n' };
    await render();
    await search('feature');
    const button = host.querySelector<HTMLButtonElement>('.staging-stage-all')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('Resolve all conflicts');
    await act(async () => {
      expect(await fileOps.stageAll()).toBe(false);
    });
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalled();
    await clickSection(1);
    expect(gitClient.stagePaths).toHaveBeenCalledExactlyOnceWith(['docs/feature notes.md', 'src/feature/edit.ts'], repo);
  });

  it('does not mix new files into the tracked changes section even without a search', async () => {
    await clickSection(1);
    const paths = vi.mocked(gitClient.stagePaths).mock.calls[0]?.[0];
    expect(paths?.slice().sort()).toEqual(status.unstaged.map((file) => file.path).sort());
    expect(gitClient.stagePaths).toHaveBeenCalledOnce();
  });

  it('unstages only the filtered entries and includes both sides of a rename', async () => {
    params = { ...params, externalStatus: { ...status, staged: [{ ...status.staged[0], originalPath: 'old/renamed.ts' }, status.staged[1]] } };
    await render();
    await search('feature');
    await clickSection(0);
    expect(gitClient.runGitCommandForRepo).toHaveBeenCalledWith(repo, 'reset', '--', 'old/renamed.ts', 'feature/renamed.ts');
    expect(gitClient.runGitCommandForRepo).not.toHaveBeenCalledWith(repo, 'reset', 'HEAD');
  });
});
