import type { TutorialStep, TutorialText } from './types';
import { branchRecipe, branchRow, branchStep } from './branchLessonHelpers';
import { mergeField as field, mergeHead } from './mergeLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { historyViewer, graphRow, commitPanel, commitFile } from './historyLessonHelpers';
import { fileTab } from './fileLessonHelpers';
import {
  AMEND_ORIGINAL_MESSAGE,
  AMEND_ORIGINAL_DESCRIPTION,
  AMEND_CONTENT,
  AMEND_FILE_MESSAGE,
  AMEND_FILE_DESCRIPTION,
  AMEND_MESSAGE_ONLY,
  AMEND_DESCRIPTION_ONLY,
} from './amendLessonExamples';
export const amendStep = (id: string, title: TutorialText, text: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  branchStep(id, title, text, target, { inspector: 'history', ...extra });
type Stage = 'start' | 'diff' | 'amend' | 'result' | 'commit' | 'file';
export function amendRecipe(stage: Stage = 'start', files = false, form = 0): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe(),
    phase = ['start', 'diff', 'amend', 'result', 'commit', 'file'].indexOf(stage);
  const actions = [...base.actions!, { waitFor: branchRow('main', true) }];
  let ready = mergeHead(4);
  if (files) actions.push({ waitFor: stagingRow('staged', 'README.md') });
  if (stage === 'diff') {
    actions.push({ click: stagingRow('staged', 'README.md') }, { waitFor: historyViewer('staged') }, { click: fileTab('diff') });
    ready = historyViewer('staged') + '[data-tab="diff"]';
  }
  if (phase >= 2) {
    actions.push(
      { click: field('amend') },
      { waitValue: { selector: field('message'), value: AMEND_ORIGINAL_MESSAGE } },
      { waitValue: { selector: field('description'), value: AMEND_ORIGINAL_DESCRIPTION } },
    );
    const values: readonly [string, TutorialText][] = [
      ['type', files ? ['fix', 'fix'] : ['feat', 'feat']],
      ['prefix', ['lernen', 'lernen']],
      ['message', files ? AMEND_FILE_MESSAGE : AMEND_MESSAGE_ONLY],
      ['description', files ? AMEND_FILE_DESCRIPTION : AMEND_DESCRIPTION_ONLY],
    ];
    for (const [index, [name, value]] of values.entries()) if (index < form || phase >= 3) actions.push({ fill: { selector: field(name), value } });
    ready = field('amend') + ' input:checked';
  }
  if (phase >= 3) {
    actions.push({ click: '.staging-commit-btn' }, { waitFor: mergeHead(5) }, { waitFor: 'body:not(:has(' + graphRow(4) + '))' });
    ready = mergeHead(5);
  }
  if (phase >= 4) {
    actions.push({ click: graphRow(5) }, { waitFor: commitPanel(5) + ' ' + commitFile() });
    ready = commitPanel(5);
  }
  if (phase >= 5) {
    actions.push({ click: commitPanel(5) + ' ' + commitFile() }, { waitFor: historyViewer(5) }, { click: fileTab('diff') });
    ready = historyViewer(5) + '[data-tab="diff"]';
  }
  return {
    ...base,
    branches: { ...base.branches!, remotes: [{ name: 'origin/main', commit: 3 }] },
    ...(files ? { edits: [{ path: 'README.md', content: AMEND_CONTENT }], indexEdits: [{ path: 'README.md', content: AMEND_CONTENT }] } : {}),
    actions,
    ready,
  };
}
