import type { TutorialStep, TutorialText } from './types';
import { rebaseRecipe, rebaseMenu, rebaseField } from './rebaseLessonHelpers';
import { mergeRecipe, mergeHead } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile } from './historyLessonHelpers';
export type RebaseGuardKind = 'root' | 'off-head' | 'merge';
export const REBASE_GUARD_MESSAGES: Record<RebaseGuardKind, TutorialText> = {
  root: ['Root-Commit kann nicht interaktiv gerebased werden.', 'The root commit cannot be interactively rebased.'],
  'off-head': ['Commit liegt nicht auf dem aktuellen HEAD-Pfad.', 'The commit is not on the current HEAD path.'],
  merge: ['Interaktiver Rebase mit Merge-Commits wird hier nicht unterstuetzt.', 'Interactive rebases containing merge commits are not supported here.'],
};
export const rebaseGuardId = (kind: RebaseGuardKind) => (kind === 'merge' ? 'rebase-merge-guard' : 'rebase-' + kind);
export const rebaseGuardTarget = (kind: RebaseGuardKind) => (kind === 'root' ? 1 : kind === 'off-head' ? 5 : 6);
export const rebaseGuardHead = (kind: RebaseGuardKind) => (kind === 'merge' ? 6 : 4);
export const rebaseGuardFailure = '.action-toast.error',
  rebaseGuardDismiss = rebaseGuardFailure + ' .toast-action-btn-close';
type Stage = 'start' | 'selected' | 'menu' | 'rejected' | 'dismissed';
export function rebaseGuardRecipe(kind: RebaseGuardKind, stage: Stage = 'start'): NonNullable<TutorialStep['prepare']> {
  const base = kind === 'merge' ? mergeRecipe({ diverged: true, stage: 'result' }) : rebaseRecipe('review');
  if (kind === 'off-head')
    base.branches = {
      fixture: 'diverged-license',
      heads: [
        { name: 'main', commit: 4 },
        { name: 'feature/begruessung', commit: 5 },
      ],
      remotes: [{ name: 'origin/main', commit: 2 }],
      current: 'main',
    };
  if (kind === 'merge') base.branches = { ...base.branches!, remotes: [{ name: 'origin/main', commit: 2 }] };
  const actions = [...base.actions!],
    number = rebaseGuardTarget(kind),
    head = rebaseGuardHead(kind);
  let ready = mergeHead(head);
  if (stage !== 'start') {
    actions.push({ click: graphRow(number) }, { waitFor: commitPanel(number) + ' ' + commitFile(kind === 'root' ? 'README.md' : 'LICENSE') });
    ready = commitPanel(number);
  }
  if (!['start', 'selected'].includes(stage)) {
    actions.push({ contextMenu: graphRow(number) }, { waitFor: rebaseMenu });
    ready = rebaseMenu;
  }
  if (stage === 'rejected' || stage === 'dismissed') {
    actions.push({ click: rebaseMenu }, { waitFor: rebaseGuardFailure }, { waitFor: mergeHead(head) }, { waitFor: 'body:not(:has(' + rebaseField + '))' });
    ready = rebaseGuardFailure;
  }
  if (stage === 'dismissed') {
    actions.push({ click: rebaseGuardDismiss }, { waitFor: 'body:not(:has(' + rebaseGuardFailure + '))' });
    ready = mergeHead(head);
  }
  return { ...base, actions, ready };
}
