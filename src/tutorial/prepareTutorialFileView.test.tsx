// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialStep } from '@/shared/tutorial/types';
import { useFileViewerTab } from '@/components/file-viewer/useFileViewerTab';
import { fileViewerRequestFromWorkingFile } from '@/components/file-viewer/fileViewerRequest';
import { useTutorialPreparation } from './useTutorialPreparation';

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
