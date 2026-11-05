import type { TutorialPreparationAction, TutorialStep } from './types';
import { branchRecipe, branchControl as c } from './branchLessonHelpers';
import { fileRow, fileTab, historyViewer } from './historyLessonHelpers';

export function branchSwitchRecipe(current = 'main', view: 'closed' | 'inspector' | 'tree' | 'file' = 'closed'): NonNullable<TutorialStep['prepare']> {
  const base = branchRecipe({ current });
  const actions: TutorialPreparationAction[] = [...base.actions!, view === 'closed' ? { collapse: c('inspector-toggle') } : { expand: c('inspector-toggle') }];
  let ready = view === 'closed' ? `${c('inspector-toggle')}[aria-expanded="false"]` : c('open-files');
  if (view === 'tree' || view === 'file') {
    actions.push({ click: c('open-files') }, { waitFor: fileRow('README.md') });
    ready = fileRow('README.md');
  }
  if (view === 'file') {
    actions.push({ click: fileRow('README.md') }, { waitFor: historyViewer() }, { click: fileTab('text') });
    ready = `${historyViewer()}[data-tab="text"] .cm-content`;
  }
  return { ...base, actions, ready };
}
