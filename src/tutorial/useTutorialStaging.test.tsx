// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { APPLICATION_OPEN_STAGING_COMMIT_EVENT } from '@/utils/layoutPreferences';
import type { TutorialHostApi, TutorialStep } from '@/shared/tutorial/types';
import { useTutorialStaging } from './useTutorialStaging';
import { DEMO_NEW_REPO } from './demoRepository';
let root: Root, container: HTMLDivElement, workspace: HTMLDivElement;
const opened = vi.fn();
const step: TutorialStep = { id: 'finish', area: 'repo', title: ['', ''], description: ['', ''], target: '[data-tutorial="untracked-files"]' };
function Harness({ current = step }) {
  useTutorialStaging(current, DEMO_NEW_REPO);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.tutorialHost = {} as TutorialHostApi;
  container = document.createElement('div');
  workspace = document.createElement('div');
  workspace.className = 'tutorial-workspace';
  document.body.append(container, workspace);
  root = createRoot(container);
  opened.mockReset();
  window.addEventListener(APPLICATION_OPEN_STAGING_COMMIT_EVENT, opened);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  workspace.remove();
  window.removeEventListener(APPLICATION_OPEN_STAGING_COMMIT_EVENT, opened);
  delete window.tutorialHost;
  vi.unstubAllGlobals();
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
}
it('waits for the real workspace controls, reveals staging once and never submits a commit', async () => {
  act(() => root.render(<Harness />));
  await settle();
  expect(opened).not.toHaveBeenCalled();
  workspace.innerHTML = '<button data-tutorial="inspector-toggle" aria-expanded="false"></button>';
  await settle();
  expect(opened).toHaveBeenCalledOnce();
  expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ repoPath: DEMO_NEW_REPO, submit: false });
  workspace.append(document.createElement('div'));
  await settle();
  expect(opened).toHaveBeenCalledOnce();
});
it('does not replace an already opened diff or another working area', async () => {
  workspace.innerHTML = '<button data-tutorial="inspector-toggle"></button><div class="file-viewer"></div>';
  act(() => root.render(<Harness current={{ ...step, openView: 'diff' }} />));
  await settle();
  expect(opened).not.toHaveBeenCalled();
  act(() => root.render(<Harness current={{ ...step, id: 'other', area: 'localRepos' }} />));
  await settle();
  expect(opened).not.toHaveBeenCalled();
});
it('honors the declared staging requirement for a repository-wide button on direct entry', async () => {
  workspace.innerHTML = '<button data-tutorial="inspector-toggle" aria-expanded="false"></button>';
  act(() => root.render(<Harness current={{ ...step, target: '[data-tutorial="stage-repository"]', inspector: 'staging' }} />));
  await settle();
  expect(opened).toHaveBeenCalledOnce();
});
it('reveals a hidden inspector for file-tree entry and leaves the visible tree mode available', async () => {
  workspace.innerHTML = '<button data-tutorial="inspector-toggle" aria-expanded="false"></button>';
  act(() => root.render(<Harness current={{ ...step, openView: 'files', inspector: 'files' }} />));
  await settle();
  expect(opened).toHaveBeenCalledOnce();
  opened.mockClear();
  workspace.innerHTML += '<button data-tutorial="open-files" aria-pressed="true"></button>';
  act(() => root.render(<Harness current={{ ...step, id: 'next', openView: 'files', inspector: 'files' }} />));
  await settle();
  expect(opened).not.toHaveBeenCalled();
});
it('reveals the history inspector once without replacing selected commits or historical files', async () => {
  const current: TutorialStep = { ...step, target: '.commit-subject', inspector: 'history' };
  workspace.innerHTML = '<button data-tutorial="inspector-toggle"></button>';
  act(() => root.render(<Harness current={current} />));
  await settle();
  expect(opened).toHaveBeenCalledOnce();
  opened.mockClear();
  workspace.innerHTML += '<div class="commit-details-panel"></div>';
  act(() => root.render(<Harness current={{ ...current, id: 'selected' }} />));
  await settle();
  window.dispatchEvent(new Event('resize'));
  await settle();
  expect(opened).not.toHaveBeenCalled();
  workspace.querySelector('.commit-details-panel')!.remove();
  workspace.innerHTML += '<div class="file-viewer"></div>';
  act(() => root.render(<Harness current={{ ...current, id: 'file' }} />));
  await settle();
  expect(opened).not.toHaveBeenCalled();
});
it('keeps the selected file-tree mode while the staging component is still loading', async () => {
  workspace.innerHTML = '<button data-tutorial="inspector-toggle"></button><button data-tutorial="open-files" aria-pressed="true"></button>';
  act(() => root.render(<Harness current={{ ...step, inspector: 'history' }} />));
  await settle();
  window.dispatchEvent(new Event('resize'));
  await settle();
  expect(opened).not.toHaveBeenCalled();
});
