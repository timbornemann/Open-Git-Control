import type { TutorialCompletion, TutorialFileContent, TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { mergeStep, mergeHead, mergeSource } from './mergeLessonHelpers';
import { branchRecipe, branchRow } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileTab } from './fileLessonHelpers';
import { conflictBothContent, conflictManualContent, conflictIncompleteContent } from './mergeExamples';
export type ConflictChoice = 'ours' | 'theirs' | 'both' | 'all-ours' | 'all-theirs' | 'manual' | 'incomplete';

export const conflictControl = (name: string) => '[data-tutorial="conflict-' + name + '"]';
export const conflictOpen = conflictControl('open') + '[data-conflict-path="README.md"]';
export const conflictContent: TutorialFileContent = { example: 'history-readme', version: 'work' };
export const conflictChoiceContent = (choice: ConflictChoice): TutorialFileContent =>
  choice === 'ours' || choice === 'all-ours'
    ? { example: 'history-readme', version: 'latest' }
    : choice === 'both'
      ? conflictBothContent
      : choice === 'manual'
        ? conflictManualContent
        : choice === 'incomplete'
          ? conflictIncompleteContent
          : conflictContent;
export const conflictStage = (stage: string) => conflictControl('editor') + '[data-conflict-dirty="' + stage + '"]';
export const conflictStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  mergeStep(id, title, description, target, { scenario: 'conflict', ...extra });
export const conflictDraft: TutorialCompletion = { kind: 'value', selector: conflictControl('content'), value: conflictContent };
export const conflictDraftFor = (choice: ConflictChoice): TutorialCompletion => ({
  kind: 'value',
  selector: conflictControl('content'),
  value: conflictChoiceContent(choice),
});
export const conflictResolvedFor = (choice: ConflictChoice): TutorialCompletion => ({
  kind: 'all',
  conditions: [
    { kind: 'absent', selector: conflictControl('editor') },
    { kind: 'element', selector: conflictControl('continue') },
    {
      kind: 'working-tree',
      staged: choice === 'ours' || choice === 'all-ours' ? [] : ['README.md'],
      unstaged: [],
      untracked: [],
      content: [{ path: 'README.md', source: 'index', value: conflictChoiceContent(choice) }],
    },
  ],
});
export const conflictResolved: TutorialCompletion = {
  kind: 'all',
  conditions: [
    { kind: 'absent', selector: conflictControl('editor') },
    { kind: 'element', selector: conflictControl('continue') },
    { kind: 'working-tree', staged: ['README.md'], unstaged: [], untracked: [], content: [{ path: 'README.md', source: 'index', value: conflictContent }] },
  ],
};
type Stage = 'start' | 'open' | 'chosen' | 'saved' | 'resolved' | 'continued';
type Options = { stage?: Stage; commit?: boolean; diff?: boolean; choice?: ConflictChoice; restored?: 'discard-draft' | 'reload'; saveResolved?: boolean };
/** Direct entry replays the actual editor and sequencer actions in order. */
export function conflictRecipe({ stage = 'start', commit, diff, choice = 'theirs', restored, saveResolved }: Options = {}): NonNullable<
  TutorialStep['prepare']
> {
  const base = branchRecipe();
  const actions: TutorialPreparationAction[] = [...base.actions!, { waitFor: branchRow('main', true) }, { waitFor: conflictOpen }];
  let ready = conflictOpen;
  if (stage !== 'start') {
    actions.push({ click: conflictOpen }, { waitFor: conflictControl('take-theirs') });
    ready = conflictControl('take-theirs');
  }
  if (['chosen', 'saved', 'resolved', 'continued'].includes(stage)) {
    if (choice === 'manual' || choice === 'incomplete') actions.push({ fill: { selector: conflictControl('content'), value: conflictChoiceContent(choice) } });
    else actions.push({ click: conflictControl(choice.startsWith('all-') ? choice : 'take-' + choice) });
    actions.push({ waitValue: { selector: conflictControl('content'), value: conflictChoiceContent(choice) } });
    ready = conflictStage('true');
  }
  if (restored) {
    actions.push({ click: conflictControl(restored) }, { waitFor: conflictStage('false') + '[data-conflict-blocks="1"]' });
    ready = conflictControl('take-theirs');
  }
  if (stage === 'saved' || (!saveResolved && (stage === 'resolved' || stage === 'continued'))) {
    actions.push({ click: conflictControl('save') }, { waitFor: conflictStage('false') });
    ready = conflictStage('false');
  }
  if (stage === 'resolved' || stage === 'continued') {
    actions.push(
      { click: conflictControl(saveResolved ? 'save-resolved' : 'mark') },
      { waitFor: conflictControl('section') + '[data-conflict-files="0"]' },
      { waitFor: 'body:not(:has(' + conflictControl('editor') + '))' },
    );
    ready = conflictControl('continue');
  }
  if (stage === 'continued') {
    actions.push({ click: conflictControl('continue') }, { waitFor: mergeHead(6) });
    ready = mergeHead(6);
  }
  if (commit || diff) {
    actions.push({ click: graphRow(6) }, { waitFor: commitPanel(6) + ' ' + commitFile() });
    ready = commitPanel(6);
  }
  if (diff) {
    actions.push({ click: commitPanel(6) + ' ' + commitFile() }, { waitFor: historyViewer(6) }, { click: fileTab('diff') });
    ready = historyViewer(6) + '[data-tab="diff"]';
  }
  return {
    ...base,
    branches: {
      fixture: 'diverged-readme',
      heads: [
        { name: 'main', commit: 4 },
        { name: mergeSource, commit: 5 },
      ],
      current: 'main',
    },
    actions,
    ready,
  };
}
