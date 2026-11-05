import type { TutorialPreparationAction } from './types';
import { ordinaryStashRecipe, ordinaryAction as action, ordinaryFile as file, emptyStashes } from './stashLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
import { historyViewer } from './historyLessonHelpers';
export type StashFilesStage = 'saved' | 'files' | 'tracked' | 'tracked-files' | 'all' | 'drop-dialog' | 'dropped';
export function stashFilesRecipe(stage: StashFilesStage = 'saved', diff = false) {
  const base = ordinaryStashRecipe({ scope: 'all', stage: 'saved', stashes: true, files: stage !== 'saved' });
  const actions: TutorialPreparationAction[] = [...base.actions!];
  let ready = base.ready!;
  if (!['saved', 'files'].includes(stage)) {
    actions.push({ click: file('README.md') + ' button' }, { waitFor: stagingRow('staged', 'README.md') });
    ready = stagingRow('staged', 'README.md');
    if (stage !== 'tracked') {
      actions.push({ click: action('files') }, { waitFor: file('notes.txt') });
      ready = file('notes.txt');
      if (stage !== 'tracked-files') {
        actions.push({ click: file('notes.txt') + ' button' }, { waitFor: stagingRow('staged', 'notes.txt') });
        ready = stagingRow('staged', 'notes.txt');
      }
    }
  }
  if (stage === 'drop-dialog' || stage === 'dropped') {
    actions.push({ click: action('drop') }, { waitFor: action('confirm-drop') });
    ready = action('confirm-drop');
    if (stage === 'dropped') {
      actions.push({ click: action('confirm-drop') }, { waitFor: emptyStashes });
      ready = emptyStashes;
    }
  }
  if (diff) {
    actions.push({ click: stagingRow('staged', 'README.md') }, { waitFor: historyViewer('staged') });
    ready = historyViewer('staged');
  }
  return { ...base, actions, ready };
}
