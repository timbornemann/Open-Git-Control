// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialStep } from '@/shared/tutorial/types';
import { useFileViewerTab } from '@/components/file-viewer/useFileViewerTab';
import { fileViewerRequestFromWorkingFile } from '@/components/file-viewer/fileViewerRequest';
import { WorkingDirectorySearchPanel } from '@/components/working-directory/WorkingDirectorySearchPanel';
import { gitClient } from '@/services/gitClient';
import { DemoRepository } from './demoRepository';
import { createDemoSearchApi } from './demoSearchApi';
import { useTutorialPreparation } from './useTutorialPreparation';

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: vi.fn() }),
  useOptionalRepositoryContext: () => null,
}));

let root: Root;
let host: HTMLDivElement;
const chooseText = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  chooseText.mockClear();
  host = document.createElement('div');
  host.className = 'tutorial-workspace';
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function Viewer({ path }: { path: string }) {
  const request = fileViewerRequestFromWorkingFile('/tutorial/repo', path);
  const { tab, setTab } = useFileViewerTab(request, {
    kind: 'text',
    text: '',
    encoding: 'utf8',
    bytes: 0,
    editable: true,
    version: 'sample',
    isMarkdown: true,
  });
  return (
    <div className="file-viewer" data-path={path} data-tab={tab}>
      <button
        data-file-tab="text"
        onClick={() => {
          chooseText();
          setTab('text');
        }}
      >
        Text
      </button>
      <button data-file-tab="preview" onClick={() => setTab('preview')}>
        Preview
      </button>
      {tab === 'text' ? <textarea data-tutorial="file-editor" /> : <article>Empty Markdown preview</article>}
    </div>
  );
}
function Harness({ step, path }: { step: TutorialStep; path: string }) {
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState(false);
  const ready = useTutorialPreparation(step);
  return (
    <>
      <output data-ready={ready}>{String(ready)}</output>
      <button data-tutorial="open-files">Working Directory</button>
      <button data-file-path="scratch" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        scratch
      </button>
      {(!path.includes('/') || expanded) && (
        <button data-file-path={path} onClick={() => setOpened(true)}>
          {path}
        </button>
      )}
      {opened && <Viewer path={path} />}
    </>
  );
}

it.each([
  ['tree-create', 'write', 'scratch/notes.md'],
  ['files-edit', 'edit', 'README.md'],
])('restores an editable Markdown view for %s/%s despite the automatic Preview default', async (chapterId, stepId, path) => {
  const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === chapterId)!.steps.find((step) => step.id === stepId)!;
  await act(async () => root.render(<Harness step={step} path={path} />));
  expect(host.querySelector('output')?.dataset.ready).toBe('true');
  expect(chooseText).toHaveBeenCalledOnce();
  expect(host.querySelector('.file-viewer')?.getAttribute('data-tab')).toBe('text');
  expect(host.querySelector('[data-tutorial="file-editor"]')).not.toBeNull();
});

it('teaches the explicit Preview-to-Text action after opening a new Markdown file', async () => {
  const chapter = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'tree-create')!;
  const opened = chapter.steps.findIndex((step) => step.id === 'open');
  const textStep = chapter.steps[opened + 1];
  expect(textStep.id).toBe('open-text');
  expect(textStep.target).toBe('.file-viewer [data-file-tab="text"]');
  expect(chapter.steps[opened + 2].id).toBe('write');
  await act(async () => root.render(<Harness step={textStep} path="scratch/notes.md" />));
  expect(host.querySelector('output')?.dataset.ready).toBe('true');
  expect(host.querySelector('.file-viewer')?.getAttribute('data-tab')).toBe('preview');
  expect(chooseText).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>(textStep.target)!.click());
  expect(host.querySelector('[data-tutorial="file-editor"]')).not.toBeNull();
});

function SearchHarness({ step }: { step: TutorialStep }) {
  const [searching, setSearching] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const ready = useTutorialPreparation(step);
  return (
    <>
      <output data-ready={ready}>{String(ready)}</output>
      <button data-tutorial="open-files">Working Directory</button>
      <button data-tutorial="file-search-toggle" onClick={() => setSearching(!searching)}>
        Search
      </button>
      {searching && <WorkingDirectorySearchPanel repoPath="/tutorial/repo" onOpenFile={setPath} onFilesChanged={async () => {}} />}
      {path && <Viewer path={path} />}
    </>
  );
}

async function openSearchStep(step: TutorialStep) {
  vi.useFakeTimers();
  const repo = new DemoRepository();
  repo.reset(step, 'de');
  // The search panel uses the same saved files as a directly entered lesson.
  repo.activeRepo = '/tutorial/repo';
  vi.spyOn(gitClient, 'searchWorkingDirectory').mockImplementation(createDemoSearchApi(repo).searchWorkingDirectory!);
  await act(async () => root.render(<SearchHarness step={step} />));
  for (let attempt = 0; attempt < 10 && host.querySelector('output')?.dataset.ready !== 'true'; attempt++) {
    await act(async () => vi.advanceTimersByTimeAsync(100));
  }
  expect(host.querySelector('output')?.dataset.ready).toBe('true');
}

const searchSteps = [
  ['search-names', 'open-file', 'contents'],
  ['search-content', 'open-match', 'saved-source'],
  ['search-one', 'open-file', 'read'],
  ['search-all', 'open-file', 'read'],
];

it.each(searchSteps)('restores the Text view when directly entering a reading step in %s', async (chapterId, _openId, readId) => {
  const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === chapterId)!.steps.find((step) => step.id === readId)!;
  await openSearchStep(step);
  expect(host.querySelector('.file-viewer')?.getAttribute('data-path')).toBe('guides/Planet.md');
  expect(host.querySelector('.file-viewer')?.getAttribute('data-tab')).toBe('text');
  expect(host.querySelector('[data-tutorial="file-editor"]')).not.toBeNull();
  expect(chooseText).toHaveBeenCalledOnce();
});

it.each(searchSteps)('teaches switching to Text after opening a result in %s', async (chapterId, openId, readId) => {
  const chapter = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === chapterId)!;
  const opened = chapter.steps.findIndex((step) => step.id === openId);
  const textStep = chapter.steps[opened + 1];
  expect(textStep.id).toBe(`${openId}-text`);
  expect(chapter.steps[opened + 2].id).toBe(readId);
  await openSearchStep(textStep);
  expect(host.querySelector('.file-viewer')?.getAttribute('data-tab')).toBe('preview');
  expect(chooseText).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>(textStep.target)!.click());
  expect(host.querySelector('[data-tutorial="file-editor"]')).not.toBeNull();
});
