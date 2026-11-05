import type { TutorialPreparationAction } from './types';
import { fileControl as c, fileRow, fileTab } from './fileLessonHelpers';
import { historyViewer } from './historyLessonHelpers';
import { mergeHead, mergeField } from './mergeLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { REBASE_LICENSE_TITLE } from './rebaseLessonExamples';
import { REBASE_LICENSE_EDIT, REBASE_EDIT_MESSAGE, REBASE_EDIT_DESCRIPTION, type RebasePauseKind } from './rebasePauseExamples';
export type RebaseEditStage = 'tree' | 'file' | 'draft' | 'saved' | 'changed' | 'staged' | 'amend' | 'amended';
export function appendRebaseEditActions(actions: TutorialPreparationAction[], stage: string, kind: RebasePauseKind, form: number) {
  const phases = ['tree', 'file', 'draft', 'saved', 'changed', 'staged', 'amend', 'amended', 'continued', 'commit', 'diff'],
    rank = phases.indexOf(stage);
  let ready = fileRow('LICENSE');
  if (rank < 0) throw new Error('Unknown practice rebase edit stage.');
  actions.push({ click: c('open-files') }, { waitFor: c('open-files') + '[aria-pressed="true"]' }, { waitFor: fileRow('LICENSE') });
  if (rank >= 1) {
    actions.push({ click: fileRow('LICENSE') }, { waitFor: historyViewer('unstaged', 'LICENSE') }, { click: fileTab('text') });
    ready = historyViewer('unstaged', 'LICENSE') + '[data-tab="text"]';
  }
  if (rank >= 2) {
    actions.push({ fill: { selector: c('file-editor'), value: REBASE_LICENSE_EDIT } });
    ready = historyViewer('unstaged', 'LICENSE') + '[data-dirty="true"]';
  }
  if (rank >= 3) {
    actions.push({ click: c('save-file') }, { waitFor: historyViewer('unstaged', 'LICENSE') + '[data-dirty="false"]' });
    ready = historyViewer('unstaged', 'LICENSE') + '[data-dirty="false"]';
  }
  if (rank >= 4) {
    actions.push(
      { click: c('close-file') },
      { waitFor: 'body:not(:has(.file-viewer))' },
      { click: c('open-staging') },
      { waitFor: c('open-staging') + '[aria-pressed="true"]' },
      { waitFor: stagingRow('unstaged', 'LICENSE') },
    );
    ready = stagingRow('unstaged', 'LICENSE');
  }
  if (rank >= 5) {
    actions.push({ click: stagingRow('unstaged', 'LICENSE') + ' ' + c('stage-file') }, { waitFor: stagingRow('staged', 'LICENSE') });
    ready = stagingRow('staged', 'LICENSE');
  }
  if (rank >= 6 && kind === 'edit') {
    const message = REBASE_LICENSE_TITLE.map((value) => value.replace(/^docs: /, '')) as unknown as readonly [string, string];
    actions.push({ click: mergeField('amend') }, { waitValue: { selector: mergeField('message'), value: message } });
    const values = [
      ['prefix', ['lernen', 'lernen']],
      ['message', REBASE_EDIT_MESSAGE],
      ['description', REBASE_EDIT_DESCRIPTION],
    ] as const;
    for (const [index, [name, value]] of values.entries()) if (index < form || rank >= 7) actions.push({ fill: { selector: mergeField(name), value } });
    ready = mergeField('amend') + ' input:checked';
  }
  if (rank >= 7 && kind === 'edit') {
    actions.push({ click: '.staging-commit-btn' }, { waitFor: mergeHead(5) }, { waitFor: mergeField('amend') + ' input:not(:checked)' });
    ready = mergeHead(5);
  }
  return ready;
}
