import { useEffect } from 'react';
import type { TutorialStep } from '@/shared/tutorial/types';
import { openStagingCommitArea } from '@/utils/layoutPreferences';

/** Prepare the real inspector even when a compact viewport initially hides it. */
export function useTutorialStaging(step: TutorialStep, repoPath: string | null) {
  useEffect(() => {
    const needsStaging =
      step.area === 'repo' &&
      (step.inspector === 'staging' ||
        step.inspector === 'files' ||
        step.inspector === 'history' ||
        step.openView === 'files' ||
        step.openView === 'diff' ||
        /staging|(?:un)?staged-files|untracked-files|data-tutorial="commit-(?:type|prefix|message|description|signoff|amend)"/.test(step.target));
    if (!window.tutorialHost || window.electronAPI || !repoPath || !needsStaging) return;
    const workspace = document.querySelector('.tutorial-workspace');
    if (!workspace) return;
    let requested = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      timer = undefined;
      const fileMode = step.inspector === 'files' || step.openView === 'files';
      if (
        requested ||
        workspace.querySelector(fileMode ? '[data-tutorial="open-files"]' : '[data-tutorial="staging"]') ||
        (step.inspector === 'history' && workspace.querySelector('[data-tutorial="open-files"], .commit-details-panel, .file-viewer')) ||
        ((step.openView === 'diff' || fileMode) && workspace.querySelector('.file-viewer'))
      )
        return;
      if (!workspace.querySelector('[data-tutorial="inspector-toggle"]')) return;
      requested = true;
      openStagingCommitArea({ repoPath, submit: false });
    };
    const schedule = () => {
      if (timer === undefined) timer = setTimeout(check, 0);
    };
    const resized = () => {
      requested = false;
      schedule();
    };
    const observer = new MutationObserver(schedule);
    observer.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
    window.addEventListener('resize', resized);
    schedule();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      window.removeEventListener('resize', resized);
    };
  }, [step.id, step.area, step.target, step.openView, step.inspector, repoPath]);
}
