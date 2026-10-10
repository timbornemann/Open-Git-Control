import type { GitMergeMode } from '@/types/git';

type Translate = (deText: string, enText: string) => string;

export function mergeModePresentation(mode: GitMergeMode, tr: Translate): { label: string; description: string } {
  if (mode === 'noFf')
    return {
      label: tr('Mit Merge-Commit', 'Create a merge commit'),
      description: tr(
        'Die Historie beider Branches bleibt erhalten. Ein zusätzlicher Commit hält die Zusammenführung fest, auch wenn ein einfaches Nachziehen möglich wäre.',
        'Keep both branch histories. An extra commit records the merge, even when the target could simply advance.',
      ),
    };
  if (mode === 'squash')
    return {
      label: tr('Für einen Commit bündeln (Squash)', 'Combine for one commit (squash)'),
      description: tr(
        'Die Änderungen werden gemeinsam im Staging vorbereitet. Du erstellst danach selbst einen Commit; die einzelnen Quell-Commits werden nicht in die Zielhistorie übernommen.',
        'Prepare the combined changes in staging. You then create a commit yourself; individual source commits are not added to the target history.',
      ),
    };
  if (mode === 'ffOnly')
    return {
      label: tr('Nur Branch nachziehen (Fast-forward)', 'Only advance the branch (fast-forward)'),
      description: tr(
        'Übernimmt die vorhandenen Commits nur, wenn der Zielbranch keine eigenen neuen Commits hat. Sonst stoppt der Merge, ohne Änderungen zusammenzuführen.',
        'Take the existing commits only if the target has no separate new commits. Otherwise the merge stops without combining changes.',
      ),
    };
  return {
    label: tr('Normal zusammenführen (Standard)', 'Merge normally (default)'),
    description: tr(
      'Übernimmt die Commit-Historie mit deiner Git-Merge-Einstellung. Normalerweise wird der Zielbranch nachgezogen oder bei getrennten Änderungen ein Merge-Commit erstellt.',
      'Take the commit history using your Git merge setting. Normally the target advances, or a merge commit is created when both branches have separate changes.',
    ),
  };
}
