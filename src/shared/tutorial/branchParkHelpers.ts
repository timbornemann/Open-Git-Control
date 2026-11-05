import type { TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { branchControl as c, branchRow } from './branchLessonHelpers';
import { branchCarryRecipe, carryButton, carryFile, carryBranch } from './branchCarryHelpers';
export const parkName: TutorialText = ['Arbeit für später', 'Work for later'];
export const parkResult = c('branch-change-result') + '[data-branch-change-switched="true"][data-branch-change-restored="false"]';
export const restoreView = '[data-branch-change-mode="restore"] .branch-change-files';
export const restoreResult = c('branch-change-result') + '[data-branch-change-restored="true"]';
export const stashEntry = '[data-tutorial="stashes"] [data-stash-name="stash@{0}"]';
export const stashAction = (action: string) => stashEntry + ' [data-stash-action=' + JSON.stringify(action) + ']';
export const stashFile = (path: string) => stashEntry + ' [data-stash-path=' + JSON.stringify(path) + ']';
const noDialog = 'body:not(:has(.branch-change))';
export type ParkStage = 'start' | 'review' | 'choice' | 'result' | 'parked' | 'offer' | 'later' | 'manual-offer' | 'restore-result' | 'restored';
export function branchParkRecipe(
  stage: ParkStage = 'start',
  options: { name?: TutorialText; stashes?: boolean; files?: boolean; preview?: 'staged' | 'unstaged' | 'new' } = {},
): NonNullable<TutorialStep['prepare']> {
  const base = branchCarryRecipe(stage === 'start' ? {} : stage === 'review' ? { dialog: 'review' } : { dialog: 'choice', name: options.name || parkName });
  const actions: TutorialPreparationAction[] = [...base.actions!];
  let ready = base.ready!;
  const parked = !['start', 'review', 'choice'].includes(stage);
  if (parked) {
    actions.push({ click: carryButton('secondary') }, { waitFor: parkResult }, { waitFor: branchRow(carryBranch, true) });
    ready = parkResult;
    if (stage !== 'result') {
      // Escape restores the dialog through its normal keyboard handler and
      // settles React/the completed workflow before the next branch action.
      actions.push({ pressKey: { selector: carryButton('cancel'), key: 'Escape' } }, { waitFor: noDialog });
      ready = c('staging');
    }
  }
  if (['offer', 'later', 'manual-offer', 'restore-result', 'restored'].includes(stage)) {
    actions.push({ click: branchRow('main') }, { waitFor: restoreView }, { waitFor: branchRow('main', true) });
    ready = restoreView;
  }
  if (stage === 'later' || stage === 'manual-offer') {
    actions.push({ pressKey: { selector: carryButton('cancel'), key: 'Escape' } }, { waitFor: noDialog });
    ready = c('staging');
  }
  if ((options.stashes || options.files || stage === 'manual-offer') && stage !== 'restored' && stage !== 'restore-result') {
    actions.push({ expand: c('stash-panel-toggle') });
    ready = stashEntry;
    actions.push({ waitFor: ready });
    if (options.files) {
      actions.push({ click: stashAction('files') }, { waitFor: stashFile('notes.txt') });
      ready = stashFile('notes.txt');
    }
  }
  if (stage === 'manual-offer') {
    actions.push({ click: stashAction('apply') }, { waitFor: restoreView });
    ready = restoreView;
  }
  if (options.preview) {
    actions.push({ click: carryFile(options.preview) }, { waitFor: carryFile(options.preview) + '[aria-pressed="true"]' });
    ready = '.branch-change-preview';
  }
  if (stage === 'restore-result' || stage === 'restored') {
    actions.push({ click: carryButton('confirm') }, { waitFor: restoreResult });
    ready = restoreResult;
    if (stage === 'restored') {
      actions.push({ pressKey: { selector: carryButton('cancel'), key: 'Escape' } }, { waitFor: noDialog });
      ready = c('staging');
      if (options.stashes) {
        actions.push({ expand: c('stash-panel-toggle') }, { waitFor: c('stashes') + ' .empty-state' });
        ready = c('stashes') + ' .empty-state';
      }
    }
  }
  return { ...base, actions, ready };
}
