import type { TranslateFn } from '@/i18n';
import type { CommitMessageEditBlock, CommitMessageEditPhase } from '@/shared/ipc/commitMessageEdit';

export function commitEditBlockText(reason: CommitMessageEditBlock, tr: TranslateFn): string {
  const messages: Record<CommitMessageEditBlock, [string, string]> = {
    bare: ['Ein Bare-Repository kann hier nicht bearbeitet werden.', 'Bare repositories cannot be edited here.'],
    shallow: ['Bitte zuerst die vollständige Repository-Historie laden.', 'Fetch the complete repository history first.'],
    detached: ['Bitte zuerst einen lokalen Branch auschecken.', 'Check out a local branch first.'],
    operation: ['Zuerst die laufende Git-Operation beenden oder abbrechen.', 'Complete or abort the current Git operation first.'],
    dirty: [
      'Bitte Änderungen zuerst committen oder selbst stashen. Arbeitsverzeichnis und Index müssen sauber sein.',
      'Commit or stash your changes first. The working tree and index must be clean.',
    ],
    'not-on-branch': ['Dieser Commit liegt nicht auf dem aktuellen Branch.', 'This commit is not on the current branch.'],
    merge: [
      'Der Abschnitt bis HEAD enthält einen Merge. Unterstützt werden lineare Abschnitte.',
      'The range through HEAD contains a merge. Only linear ranges are supported.',
    ],
    published: [
      'Dieser Commit wurde bereits veröffentlicht und kann hier nicht umgeschrieben werden.',
      'This commit has already been published and cannot be rewritten here.',
    ],
    referenced: ['Ein anderer Branch, Tag oder Stash verweist auf diesen Abschnitt.', 'Another branch, tag, or stash references this range.'],
    worktree: ['Ein anderer Worktree verwendet diesen Abschnitt.', 'Another worktree uses this range.'],
    incomplete: ['Die sichere Bearbeitung ist mit diesem Git-Zustand nicht möglich.', 'Safe editing is not supported for this Git state.'],
  };
  return tr(...messages[reason]);
}

export function commitEditPhaseText(phase: CommitMessageEditPhase, tr: TranslateFn) {
  const messages: Record<CommitMessageEditPhase, [string, string]> = {
    checking: ['Repository prüfen …', 'Checking repository …'],
    remotes: ['Veröffentlichungsstand der Remotes prüfen …', 'Checking remote publication status …'],
    rewriting: ['Commit-Nachricht sicher umschreiben …', 'Rewriting commit message safely …'],
    verifying: ['Inhalte und Historie vergleichen …', 'Comparing contents and history …'],
    publishing: ['Geprüfte Historie übernehmen …', 'Applying verified history …'],
    cleanup: ['Temporären Arbeitsbereich bereinigen …', 'Cleaning up temporary worktree …'],
  };
  return tr(...messages[phase]);
}

export function commitEditErrorText(message: string, tr: TranslateFn) {
  const reason = message.match(/blocked \(([^)]+)\)/)?.[1] as CommitMessageEditBlock | undefined;
  if (
    reason &&
    ['bare', 'shallow', 'detached', 'operation', 'dirty', 'not-on-branch', 'merge', 'published', 'referenced', 'worktree', 'incomplete'].includes(reason)
  ) {
    return `${commitEditBlockText(reason, tr)}${message.includes(': ') ? ` ${message.split(': ').slice(1).join(': ')}` : ''}`;
  }
  if (/abort|cancel/i.test(message)) return tr('Vorgang abgebrochen. Dein Entwurf bleibt erhalten.', 'Operation cancelled. Your draft has been kept.');
  return message;
}
