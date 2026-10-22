// @vitest-environment jsdom
import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { StagingFileSections } from '@/components/staging-area/StagingFileSections';
import type { StagingAreaProps } from '@/components/staging-area/types';
import type { useFileOperations } from '@/components/staging-area/useFileOperations';
import type { WorkingTreeState } from '@/hooks/useWorkingTreeSnapshot';
import { useMainViewInspector } from '../hooks/useMainViewInspector';
import { MainInspectorPane } from './MainInspectorPane';

const state = vi.hoisted(() => ({
  repository: {} as Record<string, unknown>,
  stage: vi.fn(),
  unstage: vi.fn(),
  discard: vi.fn(),
  openDiff: vi.fn(),
}));
vi.mock('@/contexts/AppStateContext', () => ({
  useRepositoryContext: () => state.repository,
  useSettingsContext: () => ({ settings: {} }),
}));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => vi.fn() }));
vi.mock('@/components/working-directory/WorkingDirectoryTree', () => ({ WorkingDirectoryTree: () => <div>Working Directory tree</div> }));
// Keep the real categorized/virtualized rows and inspector navigation. Only
// replace staging mutations and the commit form's external dependencies.
vi.mock('@/components/staging-area', () => ({
  StagingArea: ({ onSelectFileInspect, selectedFile, workingTreeStatus }: StagingAreaProps) => {
    const [draft, setDraft] = useState('');
    const [filter, setFilter] = useState('');
    return (
      <div className="staging-container">
        <input aria-label="Filter changes" value={filter} onChange={(event) => setFilter(event.target.value)} />
        <div className="staging-files">
          <div className="staging-file-sections">
            <StagingFileSections
              visibleStaged={workingTreeStatus?.staged ?? []}
              visibleUnstaged={workingTreeStatus?.unstaged ?? []}
              visibleUntracked={workingTreeStatus?.untracked ?? []}
              onSelectFileInspect={onSelectFileInspect}
              selectedFile={selectedFile}
              fileOps={
                {
                  isMutating: false,
                  stageFile: state.stage,
                  unstageFile: state.unstage,
                  discardFile: state.discard,
                  showDiff: state.openDiff,
                  stagedStats: {},
                  unstagedStats: {},
                } as unknown as ReturnType<typeof useFileOperations>
              }
            />
          </div>
        </div>
        <textarea aria-label="Commit draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      </div>
    );
  },
}));

const hash = 'a'.repeat(40);
const repoPath = 'C:/repo';
const workingTree = {
  dataRepoPath: repoPath,
  status: {
    staged: [{ path: 'staged.ts', x: 'M', y: ' ' }],
    unstaged: [{ path: 'src/renamed.ts', originalPath: 'src/original.ts', x: ' ', y: 'R' }],
    untracked: [{ path: 'new.ts', x: '?', y: '?' }],
  },
  refresh: vi.fn(),
} as unknown as WorkingTreeState;
let root: Root, host: HTMLDivElement;
function Harness({ language = 'en' }: { language?: 'en' | 'de' }) {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [request, setRequest] = useState<{ hash: string; requestId: number } | null>(null);
  const navigate = useCallback((hash: string) => {
    setSelectedCommit(hash);
    setRequest((current) => ({ hash, requestId: (current?.requestId ?? 0) + 1 }));
  }, []);
  const inspector = useMainViewInspector({
    activeRepo: repoPath,
    setSelectedCommit,
    onOpenRepoWorkspace: () => {},
    commitNavigationRequest: request,
    onNavigateToCommit: navigate,
  });
  const [directoryMode, setDirectoryMode] = useState<'staging' | 'tree'>('staging');
  const [expanded, setExpanded] = useState(new Set<string>());
  state.repository = { activeRepo: repoPath, selectedCommit, refreshTrigger: 0 };
  return (
    <I18nProvider language={language}>
      <MainInspectorPane
        {...inspector}
        isContentResizing={false}
        onContentResizeStart={() => {}}
        workingTree={workingTree}
        onOpenWorkingDirectoryFile={() => {}}
        onWorkingDirectoryEntryInvalidated={() => {}}
        directoryMode={directoryMode}
        onDirectoryModeChange={setDirectoryMode}
        expandedDirectoryPaths={expanded}
        onExpandedDirectoryPathsChange={setExpanded}
      />
      <output>{JSON.stringify(inspector.activeDiffRequest)}</output>
    </I18nProvider>
  );
}
const click = (element: HTMLElement) => act(async () => element.click());
const row = (path: string) => host.querySelector<HTMLElement>(`.staging-file-row[aria-label="${path}"]`)!;
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === label)!;
const render = (language: 'en' | 'de' = 'en') => act(async () => root.render(<Harness language={language} />));
const input = (selector: string, value: string) =>
  act(() => {
    const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'getFileHistory').mockResolvedValue({
    success: true,
    data: [{ hash, abbrevHash: 'aaaaaaaa', path: 'src/original.ts', subject: 'Original change', author: 'Author', date: '2026-10-21' }],
  });
  vi.spyOn(gitClient, 'getFileBlameRange').mockResolvedValue({ success: true, data: [] });
  vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(async (_repo, command) => ({
    success: true,
    data: command === 'commitDetails' ? 'M\0src/original.ts\0' : '',
  }));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('working-tree inspector split', () => {
  it('keeps the categorized staging list, filters, draft and scroll while showing the common file details above it', async () => {
    await render();
    const staging = host.querySelector('.staging-container');
    const list = row('staged.ts').closest<HTMLElement>('.staging-section-list')!;
    list.scrollTop = 7;
    input('[aria-label="Commit draft"]', 'Keep this commit message');
    input('[aria-label="Filter changes"]', 'Keep this filter');
    await click(row('src/renamed.ts'));
    expect(host.querySelector('.staging-container')).toBe(staging);
    expect(list.scrollTop).toBe(7);
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Keep this commit message');
    expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('Keep this filter');
    const split = host.querySelector('.working-tree-inspector')!;
    expect(split.classList.contains('has-selection')).toBe(true);
    expect(split.children[0].className).toBe('commit-file-details');
    expect(split.children[1].className).toBe('working-tree-inspector__directory');
    expect(host.querySelectorAll('.staging-section')).toHaveLength(3);
    expect(host.querySelector('.commit-file-tree')).toBeNull();
    expect(host.querySelector('.commit-file-details__name')?.textContent).toBe('renamed.ts');
    expect(host.querySelector('.commit-file-details__status')?.textContent).toBe('Renamed');
    expect(host.querySelector('.commit-file-details__previous-path')?.textContent).toContain('src/original.ts');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ source: 'unstaged', path: 'src/renamed.ts' });
    expect(state.openDiff).not.toHaveBeenCalled();
    expect(row('src/renamed.ts').getAttribute('aria-current')).toBe('true');
    await click(row('staged.ts'));
    expect(host.querySelector('.staging-container')).toBe(staging);
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ source: 'staged', path: 'staged.ts' });
    expect(host.querySelector('.commit-file-details__revision')?.textContent).toContain('Staged');
    await click(row('staged.ts').querySelector('button')!);
    expect(state.unstage).toHaveBeenCalledOnce();
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Close file details"]')!);
    expect(host.querySelector('.commit-file-details')).toBeNull();
    expect(host.querySelector('.staging-container')).toBe(staging);
    expect(host.querySelector('output')?.textContent).toContain('staged.ts');
  });

  it('opens the historical path and diff from working-file history and restores uncommitted changes on Back', async () => {
    await render();
    await click(row('src/renamed.ts'));
    expect(gitClient.getFileHistory).toHaveBeenCalledWith('src/original.ts', undefined, 81, repoPath);
    await click(host.querySelector<HTMLButtonElement>('.file-history-entry')!);
    expect(host.querySelector('.commit-file-details__name')?.textContent).toBe('original.ts');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ source: 'commit', path: 'src/original.ts', commitHash: hash });
    expect(host.querySelector('.commit-file-tree [aria-current="true"]')?.getAttribute('title')).toBe('src/original.ts');
    await click(button('Back'));
    expect(host.querySelector('.commit-file-details__name')?.textContent).toBe('renamed.ts');
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ path: 'src/renamed.ts', source: 'unstaged' });
    expect(row('src/renamed.ts').getAttribute('aria-current')).toBe('true');
  });

  it('supports keyboard file selection and German details without a patch tab', async () => {
    await render('de');
    await act(async () => row('new.ts').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(host.querySelector('.commit-file-details__status')?.textContent).toBe('Unversioniert');
    expect([...host.querySelectorAll('.commit-file-details__tab')].map((tab) => tab.textContent)).toEqual(['Historie', 'Blame']);
    expect(host.querySelector('[aria-label="Dateipfad kopieren"]')).not.toBeNull();
    await click(button('Blame'));
    expect(gitClient.getFileBlameRange).toHaveBeenCalledWith('new.ts', undefined, 1, expect.any(Number), repoPath, 'unstaged');
  });
});
