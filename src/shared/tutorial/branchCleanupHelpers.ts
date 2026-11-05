import type { TutorialPreparationAction, TutorialStep } from './types';
import { cleanupPatternMatches, DEFAULT_CLEANUP_PROTECTION } from '../git/branchCleanupProtection';
import { branchUnmergedRecipe, unmergedBranch } from './branchUnmergedHelpers';
import { branchPanel } from './branchLessonHelpers';
export const cleanupMerged = ['feature/fertig', 'fix/integriert'] as const;
export const cleanupManual = unmergedBranch;
export const cleanupTrigger = branchPanel + ' [aria-haspopup="menu"]';
export const cleanupMenuItem = '[data-sidebar-action="cleanup"]';
export const cleanupDialog = '[role="dialog"]:has(.branch-cleanup-dialog)';
export const cleanupCandidate = (name: string) => '[data-cleanup-kind="local"][data-cleanup-name=' + JSON.stringify(name) + ']';
export const cleanupCheckbox = (name: string) => cleanupCandidate(name) + ' input';
export const cleanupDialogAction = (action: 'confirm' | 'cancel' | 'secondary') => cleanupDialog + ' [data-dialog-action=' + JSON.stringify(action) + ']';
export const cleanupTarget = '[data-cleanup-comparison="local"]';
export const cleanupTargetId = (name: string) => 'local-' + encodeURIComponent(name);
export const cleanupProtection = '.branch-cleanup-protection textarea';
export const cleanupSaveProtection = '[data-tutorial="cleanup-save-protection"]';
export const cleanupDefaults = DEFAULT_CLEANUP_PROTECTION.join('\n');
export const cleanupCustomPatterns = [...DEFAULT_CLEANUP_PROTECTION, 'feature/*'];
export const cleanupCustomText = cleanupCustomPatterns.join('\n');

type Options = {
  open?: 'menu' | 'dialog';
  selected?: readonly string[];
  kept?: boolean;
  protection?: boolean;
  patterns?: readonly string[];
  draftPatterns?: string;
  target?: string;
  review?: boolean;
  confirmed?: boolean;
  result?: boolean;
};
export function branchCleanupRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const base = branchUnmergedRecipe();
  const actions: TutorialPreparationAction[] = [...base.actions!];
  let ready = base.ready!;
  if (options.open) {
    actions.push({ click: cleanupTrigger }, { waitFor: cleanupMenuItem });
    ready = cleanupMenuItem;
  }
  if (options.open === 'dialog') {
    actions.push({ click: cleanupMenuItem }, { waitFor: cleanupCheckbox(cleanupMerged[1]) });
    ready = cleanupTarget;
    if (options.target) {
      const value = cleanupTargetId(options.target);
      actions.push({ fill: { selector: cleanupTarget, value: [value, value] } }, { waitValue: { selector: cleanupTarget, value: [value, value] } });
    }
    if (options.selected) {
      for (const name of [...cleanupMerged, cleanupManual]) {
        if (name === options.target || options.patterns?.some((pattern) => cleanupPatternMatches(name, pattern))) continue;
        const value = String(options.selected.includes(name));
        actions.push({ fill: { selector: cleanupCheckbox(name), value: [value, value] } });
      }
    }
    if (options.kept) actions.push({ click: '.branch-cleanup-kept > summary' }, { waitFor: '.branch-cleanup-kept[open]' });
    if (options.protection) actions.push({ click: '.branch-cleanup-protection > summary' }, { waitFor: '.branch-cleanup-protection[open]' });
    if (options.draftPatterns !== undefined) actions.push({ fill: { selector: cleanupProtection, value: [options.draftPatterns, options.draftPatterns] } });
    if (options.review) {
      actions.push({ click: cleanupDialogAction('confirm') }, { waitFor: '.branch-cleanup-force-warning' });
      ready = '.branch-cleanup-force-warning';
      if (options.confirmed) actions.push({ fill: { selector: '.branch-cleanup-force-confirm input', value: ['true', 'true'] } });
    }
    if (options.result) {
      actions.push({ click: cleanupDialogAction('confirm') }, { waitFor: '.branch-cleanup-results' });
      ready = '.branch-cleanup-results';
    }
  }
  return {
    ...base,
    branches: {
      ...base.branches!,
      heads: [
        { name: 'main', commit: 3 },
        { name: cleanupMerged[0], commit: 2 },
        { name: cleanupMerged[1], commit: 3 },
        { name: cleanupManual, commit: 4 },
      ],
      protectedPatterns: options.patterns,
    },
    actions,
    ready,
  };
}
export function branchCleanupRemainingRecipe(removed: readonly string[]): NonNullable<TutorialStep['prepare']> {
  const base = branchCleanupRecipe();
  return { ...base, branches: { ...base.branches!, heads: base.branches!.heads.filter((head) => !removed.includes(head.name)) } };
}
