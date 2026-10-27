import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import type { TranslateFn } from '@/i18n';
import type { ToastMessage } from '@/types/git';
import type { GraphLayout, GraphNode } from '@/utils/graphLayout';
import { gitClient } from '@/services/gitClient';
import type { MenuAction } from './CommitContextMenu';

type BuildCommitHistoryMenuActionsParams = {
  repoPath: string | null;
  node: GraphNode;
  layout: GraphLayout | null;
  reachableFromHead: Set<string>;
  runGitAction: (args: string[], successMsg: string) => Promise<void> | void;
  setConfirmDialog: (value: ConfirmDialogState | null) => void;
  setInputDialog: (value: InputDialogState | null) => void;
  setToast: (toast: ToastMessage | null) => void;
  refreshCommits: () => Promise<void> | void;
  refreshWorkingTreeStatus: () => Promise<void> | void;
  tr: TranslateFn;
};

export const buildCommitHistoryMenuActions = ({
  repoPath,
  node,
  layout,
  reachableFromHead,
  runGitAction,
  setConfirmDialog,
  setInputDialog,
  setToast,
  refreshCommits,
  refreshWorkingTreeStatus,
  tr,
}: BuildCommitHistoryMenuActionsParams): MenuAction[] => {
  const hash = node.commit.hash;
  const shortHash = node.commit.abbrevHash;
  const actions: MenuAction[] = [
    {
      label: '',
      icon: '',
      separator: true,
      action: () => {},
    },
    {
      label: tr(`Cherry-Pick ${shortHash}`, `Cherry-pick ${shortHash}`),
      description: tr(
        'Übernimmt die Änderungen dieses einzelnen Commits als neuen Commit in deinen aktuellen Branch.',
        "Applies this commit's changes as a new commit on your current branch.",
      ),
      icon: 'CP',
      action: () =>
        runGitAction(gitClient.buildCherryPickCommitArgs(hash), tr(`Cherry-Pick von ${shortHash} erfolgreich.`, `Successfully cherry-picked ${shortHash}.`)),
    },
    ...(node.isMerge
      ? []
      : [
          {
            label: tr(`Revert ${shortHash}`, `Revert ${shortHash}`),
            description: tr(
              'Erstellt einen neuen Commit, der die Änderungen dieses Commits rückgängig macht. Der ursprüngliche Commit bleibt erhalten.',
              "Creates a new commit that undoes this commit's changes. The original commit stays in the history.",
            ),
            icon: 'RV',
            action: () =>
              runGitAction(
                gitClient.buildRevertCommitArgs(hash, { noEdit: true }),
                tr(`Revert von ${shortHash} erfolgreich.`, `Successfully reverted ${shortHash}.`),
              ),
          },
        ]),
    {
      label: '',
      icon: '',
      separator: true,
      action: () => {},
    },
    {
      label: tr(`Reset --soft auf ${shortHash}`, `Reset --soft to ${shortHash}`),
      description: tr(
        'Setzt den Branch auf diesen Commit zurück. Deine Dateien und die für den nächsten Commit vorgemerkten Änderungen (Staging) bleiben unverändert.',
        'Moves your branch back to this commit. Your files and the changes staged for the next commit stay unchanged.',
      ),
      icon: 'RS',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: tr('Soft Reset ausfuehren?', 'Perform soft reset?'),
          message: tr('HEAD wird auf den Commit gesetzt, Aenderungen bleiben staged.', 'HEAD will move to this commit while changes remain staged.'),
          contextItems: [
            { label: tr('Commit', 'Commit'), value: shortHash },
            { label: tr('Reset-Modus', 'Reset mode'), value: '--soft' },
          ],
          irreversible: false,
          consequences: tr('Die Commit-Historie wird lokal verschoben.', 'The local commit history will be moved.'),
          confirmLabel: tr('Soft Reset', 'Soft reset'),
          onConfirm: async () => {
            await runGitAction(
              gitClient.buildResetToCommitArgs('--soft', hash),
              tr(`Soft-Reset auf ${shortHash} erfolgreich.`, `Successfully soft-reset to ${shortHash}.`),
            );
          },
        });
      },
    },
    {
      label: tr(`Reset --mixed auf ${shortHash}`, `Reset --mixed to ${shortHash}`),
      description: tr(
        'Setzt den Branch auf diesen Commit zurück und leert die Staging-Auswahl. Deine Dateien bleiben unverändert; Änderungen kannst du neu vormerken.',
        'Moves your branch back to this commit and clears the staging selection. Your files stay unchanged; you can stage the changes again.',
      ),
      icon: 'RM',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: tr('Mixed Reset ausfuehren?', 'Perform mixed reset?'),
          message: tr(
            'HEAD wird verschoben, Aenderungen bleiben unstaged im Working Tree.',
            'HEAD will move while changes remain unstaged in the working tree.',
          ),
          contextItems: [
            { label: tr('Commit', 'Commit'), value: shortHash },
            { label: tr('Reset-Modus', 'Reset mode'), value: '--mixed' },
          ],
          irreversible: false,
          consequences: tr('Index wird zurueckgesetzt. Commit-Historie aendert sich lokal.', 'The index will be reset and local commit history will change.'),
          confirmLabel: tr('Mixed Reset', 'Mixed reset'),
          onConfirm: async () => {
            await runGitAction(
              gitClient.buildResetToCommitArgs('--mixed', hash),
              tr(`Mixed-Reset auf ${shortHash} erfolgreich.`, `Successfully mixed-reset to ${shortHash}.`),
            );
          },
        });
      },
    },
    {
      label: tr(`Reset --hard auf ${shortHash}`, `Reset --hard to ${shortHash}`),
      description: tr(
        'Setzt den Branch und die erfassten Dateien auf diesen Commit zurück. Dabei gehen nicht committete Änderungen verloren.',
        'Resets your branch and tracked files to this commit. Uncommitted changes will be lost.',
      ),
      icon: 'RH',
      danger: true,
      action: () => {
        setConfirmDialog({
          variant: 'danger',
          title: tr('Hard Reset ausfuehren?', 'Perform hard reset?'),
          message: tr(
            'HEAD, Index und Working Tree werden auf den Commit zurueckgesetzt.',
            'HEAD, the index, and the working tree will be reset to this commit.',
          ),
          contextItems: [
            { label: tr('Commit', 'Commit'), value: shortHash },
            { label: tr('Reset-Modus', 'Reset mode'), value: '--hard' },
          ],
          irreversible: true,
          consequences: tr('Lokale nicht-gesicherte Aenderungen gehen verloren.', 'Uncommitted local changes will be lost.'),
          confirmLabel: tr('Hard Reset', 'Hard reset'),
          onConfirm: async () => {
            await runGitAction(
              gitClient.buildResetToCommitArgs('--hard', hash),
              tr(`Hard-Reset auf ${shortHash} erfolgreich.`, `Successfully hard-reset to ${shortHash}.`),
            );
          },
        });
      },
    },
    {
      label: tr(`Interaktiver Rebase bis ${shortHash}`, `Interactive rebase through ${shortHash}`),
      description: tr(
        'Lässt dich diesen und die folgenden Commits umordnen, bearbeiten, zusammenfassen oder entfernen. Dabei wird die Commit-Historie neu geschrieben.',
        'Lets you reorder, edit, combine or remove this commit and the commits after it. This rewrites the commit history.',
      ),
      icon: 'IR',
      action: () => {
        if (!layout) return;

        const selectedNode = layout.nodes.find((candidate) => candidate.commit.hash === hash);
        if (!selectedNode) {
          setToast({ msg: tr('Ausgewaehlter Commit wurde nicht gefunden.', 'The selected commit could not be found.'), isError: true });
          return;
        }

        if (selectedNode.commit.parentHashes.length === 0) {
          setToast({ msg: tr('Root-Commit kann nicht interaktiv gerebased werden.', 'The root commit cannot be interactively rebased.'), isError: true });
          return;
        }

        const headPath = layout.nodes.filter((candidate) => reachableFromHead.has(candidate.commit.hash));
        const selectedIndex = headPath.findIndex((candidate) => candidate.commit.hash === hash);
        if (selectedIndex < 0) {
          setToast({ msg: tr('Commit liegt nicht auf dem aktuellen HEAD-Pfad.', 'The commit is not on the current HEAD path.'), isError: true });
          return;
        }

        const rangeNewestFirst = headPath.slice(0, selectedIndex + 1);
        if (rangeNewestFirst.some((candidate) => candidate.isMerge)) {
          setToast({
            msg: tr(
              'Interaktiver Rebase mit Merge-Commits wird hier nicht unterstuetzt.',
              'Interactive rebases containing merge commits are not supported here.',
            ),
            isError: true,
          });
          return;
        }

        const rangeOldestFirst = [...rangeNewestFirst].reverse();
        const defaultTodo = rangeOldestFirst.map((candidate) => `pick ${candidate.commit.hash} ${candidate.commit.subject}`).join('\n');

        const baseHash = selectedNode.commit.parentHashes[0];

        setInputDialog({
          title: tr('Interaktiven Rebase starten', 'Start interactive rebase'),
          message: tr(
            'Bearbeite die Rebase-Todo-Liste (pick/reword/edit/squash/fixup/drop).',
            'Edit the rebase todo list (pick/reword/edit/squash/fixup/drop).',
          ),
          fields: [
            {
              id: 'todo',
              label: tr('Rebase-Todo', 'Rebase todo'),
              defaultValue: defaultTodo,
              required: true,
              multiline: true,
              helperText: tr('Eine Zeile pro Commit, z. B. "pick <hash> <message>"', 'One line per commit, e.g. "pick <hash> <message>"'),
            },
          ],
          contextItems: [
            { label: tr('Basis', 'Base'), value: baseHash.slice(0, 8) },
            { label: tr('Commit-Anzahl', 'Commit count'), value: String(rangeOldestFirst.length) },
          ],
          irreversible: false,
          consequences: tr(
            'Commits werden lokal umgeschrieben. Bei Konflikten Rebase continue/abort im Working Directory nutzen.',
            'Commits will be rewritten locally. If conflicts occur, use rebase continue/abort in the working directory.',
          ),
          confirmLabel: tr('Rebase starten', 'Start rebase'),
          onSubmit: async (values) => {
            const lines = (values.todo || '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);

            if (lines.length === 0 || !gitClient.isAvailable()) return;

            if (!repoPath) return;
            const result = await gitClient.startInteractiveRebase(baseHash, lines, repoPath);
            if (!result.success) {
              setToast({ msg: result.error || tr('Interaktiver Rebase fehlgeschlagen.', 'Interactive rebase failed.'), isError: true });
              return;
            }

            setToast({ msg: tr('Interaktiver Rebase gestartet.', 'Interactive rebase started.'), isError: false });
            refreshCommits();
            refreshWorkingTreeStatus();
          },
        });
      },
    },
    {
      label: '',
      icon: '',
      separator: true,
      action: () => {},
    },
    {
      label: tr('Commit-Hash kopieren', 'Copy commit hash'),
      description: tr(
        'Kopiert die vollständige eindeutige Kennung dieses Commits in die Zwischenablage.',
        'Copies the full unique identifier of this commit to the clipboard.',
      ),
      icon: 'ID',
      action: () => {
        navigator.clipboard.writeText(hash);
        setToast({ msg: tr('Hash kopiert!', 'Hash copied!'), isError: false });
      },
    },
  ];

  if (node.isMerge) {
    actions.splice(2, 0, {
      label: tr(`Merge ${shortHash} reverten`, `Revert merge ${shortHash}`),
      description: tr(
        'Macht die durch diesen Merge hinzugekommenen Änderungen mit einem neuen Commit rückgängig. Die bisherigen Commits bleiben erhalten.',
        'Creates a new commit that undoes the changes introduced by this merge. The existing commits stay in the history.',
      ),
      icon: 'MR',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: tr('Merge-Revert ausfuehren?', 'Revert merge commit?'),
          message: tr('Der Merge-Commit wird mit Parent 1 als Hauptlinie reverted.', 'The merge commit will be reverted using parent 1 as the mainline.'),
          contextItems: [
            { label: tr('Merge-Commit', 'Merge commit'), value: shortHash },
            { label: tr('Parent', 'Parent'), value: '1' },
          ],
          irreversible: false,
          consequences: tr(
            'Es entsteht ein neuer Revert-Commit und moegliche Konflikte muessen geloest werden.',
            'A new revert commit will be created and any resulting conflicts must be resolved.',
          ),
          confirmLabel: tr('Merge-Revert', 'Revert merge'),
          onConfirm: async () => {
            await runGitAction(
              gitClient.buildRevertCommitArgs(hash, { mainline: 1, noEdit: true }),
              tr(`Merge-Revert von ${shortHash} erfolgreich.`, `Successfully reverted merge ${shortHash}.`),
            );
          },
        });
      },
    });
  }

  return actions;
};
