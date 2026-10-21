type Translate = (de: string, en: string) => string;
export function branchChangeLabels(restore: boolean, step: number, busy: boolean, result: boolean, tr: Translate) {
  return {
    title: restore
      ? tr('Geparkte Änderungen wiederherstellen', 'Restore parked changes')
      : tr('Änderungen beim Branchwechsel', 'Changes when switching branches'),
    cancel: busy ? tr('Abbrechen', 'Cancel') : result ? tr('Schließen', 'Close') : restore ? tr('Später', 'Later') : tr('Abbrechen', 'Cancel'),
    confirm: restore ? tr('Wiederherstellen', 'Restore') : step === 0 ? tr('Weiter', 'Next') : tr('Mitnehmen und wechseln', 'Carry and switch'),
  };
}
export function branchChangeText(message: string, tr: Translate) {
  const pairs: Record<string, string> = {
    'Reading repository and worktrees': 'Repository und Worktrees werden gelesen …',
    'Checking changed file contents': 'Geänderte Dateiinhalte werden geprüft …',
    'Checking index and working changes': 'Staging-Zustand und Änderungen werden verglichen …',
    'Checking worktrees and active Git operations': 'Worktrees und laufende Git-Vorgänge werden geprüft …',
    'Checking checkout target': 'Zielbranch wird geprüft …',
    'Removing the restored backup': 'Erfolgreich wiederhergestellte Sicherung wird entfernt …',
    'Handle modified submodules or nested repositories before parking changes.': 'Sichere zuerst Änderungen an Submodulen oder eingebetteten Repositories.',
    'Another branch-change operation is running.': 'Ein anderer Branchwechsel läuft bereits.',
    'The branch name is already in use.': 'Dieser Branchname ist bereits vergeben.',
    'The checkout target is missing. Refresh the branch list.': 'Das Wechselziel fehlt. Aktualisiere die Branchliste.',
    'The parked changes are no longer available.': 'Die geparkten Änderungen sind nicht mehr verfügbar.',
    'The worktree is not ready to restore the saved changes.': 'Der Worktree ist noch nicht bereit für die Wiederherstellung.',
    'The branch-change choice does not match the task checkout.': 'Die Auswahl zum Branchwechsel passt nicht mehr zur Aufgabe.',
    'Review the restoration state before applying again.': 'Prüfe den Wiederherstellungsstand vor einer erneuten Anwendung.',
    'The working state changed before checkout. The stash is retained.': 'Der Arbeitsstand hat sich vor dem Wechsel geändert. Der Stash bleibt erhalten.',
    'The checkout target changed. The stash is retained.': 'Das Wechselziel hat sich geändert. Der Stash bleibt erhalten.',
    'The target revision changed during checkout. Review the saved changes before restoring.':
      'Die Zielrevision hat sich beim Wechsel geändert. Prüfe die Sicherung vor der Wiederherstellung.',
    'The saved changes differ from the reviewed state.': 'Die gesicherten Änderungen weichen vom geprüften Stand ab.',
    'The saved new files differ from the reviewed state.': 'Die gesicherten neuen Dateien weichen vom geprüften Stand ab.',
    'Git did not create the expected stash.': 'Git hat den erwarteten Stash nicht erstellt.',
    'Changes restored. The stash stack changed, so the backup was retained.':
      'Änderungen wiederhergestellt. Die Stash-Liste hat sich geändert; die Sicherung bleibt erhalten.',
    'Changes restored. The backup could not be safely removed.': 'Änderungen wiederhergestellt. Die Sicherung konnte nicht sicher entfernt werden.',
    'Changes restored. The resulting state could not be verified, so the backup was retained.':
      'Änderungen wiederhergestellt. Der resultierende Stand ließ sich nicht sicher prüfen; die Sicherung bleibt erhalten.',
    'Create the initial commit before parking changes.': 'Erstelle vor dem Parken den ersten Commit.',
    'Finish the active Git operation first.': 'Schließe zuerst den laufenden Git-Vorgang ab.',
    'Resolve existing conflicts first.': 'Löse zuerst die vorhandenen Konflikte.',
    'Commit or stash changes inside modified submodules first.': 'Sichere zuerst die Änderungen innerhalb der Submodule durch Commit oder Stash.',
    'The target branch is checked out in another worktree.': 'Der Zielbranch ist in einem anderen Worktree ausgecheckt.',
    'Restore these changes in their original worktree.': 'Stelle diese Änderungen im ursprünglichen Worktree wieder her.',
    'Commit or park the current changes before restoring.': 'Committe oder parke die aktuellen Änderungen vor dem Wiederherstellen.',
    'The saved stash is missing.': 'Der gespeicherte Stash fehlt.',
    'Review the previous restoration before applying these changes again.':
      'Prüfe die vorherige Wiederherstellung, bevor du diese Änderungen erneut anwendest.',
    'Saving reviewed changes': 'Geprüfte Änderungen sichern',
    'Switching branch': 'Branch wechseln',
    'Restoring changes and staged state': 'Änderungen und Staging-Zustand wiederherstellen',
    'The working state changed. Review the branch change again.': 'Der Arbeitsstand hat sich geändert. Prüfe den Branchwechsel erneut.',
    'The checkout target changed. Review it again.': 'Der Zielbranch hat sich geändert. Prüfe ihn erneut.',
    'The branch-change preview expired. Review the changes again.': 'Die Vorschau ist abgelaufen. Prüfe die Änderungen erneut.',
  };
  return pairs[message] ? tr(pairs[message], message) : message;
}
