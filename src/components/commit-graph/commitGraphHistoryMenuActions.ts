import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import type { ToastMessage } from '@/types/git';
import type { GraphLayout, GraphNode } from '@/utils/graphLayout';
import { gitClient } from '@/services/gitClient';
import type { MenuAction } from './CommitContextMenu';

type BuildCommitHistoryMenuActionsParams = {
  node: GraphNode;
  layout: GraphLayout | null;
  reachableFromHead: Set<string>;
  runGitAction: (args: string[], successMsg: string) => Promise<void> | void;
  setConfirmDialog: (value: ConfirmDialogState | null) => void;
  setInputDialog: (value: InputDialogState | null) => void;
  setToast: (toast: ToastMessage | null) => void;
  refreshCommits: () => Promise<void> | void;
  refreshWorkingTreeStatus: () => Promise<void> | void;
};

export const buildCommitHistoryMenuActions = ({
  node,
  layout,
  reachableFromHead,
  runGitAction,
  setConfirmDialog,
  setInputDialog,
  setToast,
  refreshCommits,
  refreshWorkingTreeStatus,
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
      label: `Cherry-Pick ${shortHash}`,
      icon: 'CP',
      action: () => runGitAction(gitClient.buildCherryPickCommitArgs(hash), `Cherry-Pick von ${shortHash} erfolgreich.`),
    },
    {
      label: `Revert ${shortHash}`,
      icon: 'RV',
      action: () => runGitAction(gitClient.buildRevertCommitArgs(hash, { noEdit: true }), `Revert von ${shortHash} erfolgreich.`),
    },
    {
      label: '',
      icon: '',
      separator: true,
      action: () => {},
    },
    {
      label: `Reset --soft auf ${shortHash}`,
      icon: 'RS',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: 'Soft Reset ausfuehren?',
          message: 'HEAD wird auf den Commit gesetzt, Aenderungen bleiben staged.',
          contextItems: [
            { label: 'Commit', value: shortHash },
            { label: 'Reset-Modus', value: '--soft' },
          ],
          irreversible: false,
          consequences: 'Die Commit-Historie wird lokal verschoben.',
          confirmLabel: 'Soft Reset',
          onConfirm: async () => {
            await runGitAction(gitClient.buildResetToCommitArgs('--soft', hash), `Soft-Reset auf ${shortHash} erfolgreich.`);
          },
        });
      },
    },
    {
      label: `Reset --mixed auf ${shortHash}`,
      icon: 'RM',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: 'Mixed Reset ausfuehren?',
          message: 'HEAD wird verschoben, Aenderungen bleiben unstaged im Working Tree.',
          contextItems: [
            { label: 'Commit', value: shortHash },
            { label: 'Reset-Modus', value: '--mixed' },
          ],
          irreversible: false,
          consequences: 'Index wird zurueckgesetzt. Commit-Historie aendert sich lokal.',
          confirmLabel: 'Mixed Reset',
          onConfirm: async () => {
            await runGitAction(gitClient.buildResetToCommitArgs('--mixed', hash), `Mixed-Reset auf ${shortHash} erfolgreich.`);
          },
        });
      },
    },
    {
      label: `Reset --hard auf ${shortHash}`,
      icon: 'RH',
      danger: true,
      action: () => {
        setConfirmDialog({
          variant: 'danger',
          title: 'Hard Reset ausfuehren?',
          message: 'HEAD, Index und Working Tree werden auf den Commit zurueckgesetzt.',
          contextItems: [
            { label: 'Commit', value: shortHash },
            { label: 'Reset-Modus', value: '--hard' },
          ],
          irreversible: true,
          consequences: 'Lokale nicht-gesicherte Aenderungen gehen verloren.',
          confirmLabel: 'Hard Reset',
          onConfirm: async () => {
            await runGitAction(gitClient.buildResetToCommitArgs('--hard', hash), `Hard-Reset auf ${shortHash} erfolgreich.`);
          },
        });
      },
    },
    {
      label: `Interaktiver Rebase bis ${shortHash}`,
      icon: 'IR',
      action: () => {
        if (!layout) return;

        const selectedNode = layout.nodes.find((candidate) => candidate.commit.hash === hash);
        if (!selectedNode) {
          setToast({ msg: 'Ausgewaehlter Commit wurde nicht gefunden.', isError: true });
          return;
        }

        if (selectedNode.commit.parentHashes.length === 0) {
          setToast({ msg: 'Root-Commit kann nicht interaktiv gerebased werden.', isError: true });
          return;
        }

        const headPath = layout.nodes.filter((candidate) => reachableFromHead.has(candidate.commit.hash));
        const selectedIndex = headPath.findIndex((candidate) => candidate.commit.hash === hash);
        if (selectedIndex < 0) {
          setToast({ msg: 'Commit liegt nicht auf dem aktuellen HEAD-Pfad.', isError: true });
          return;
        }

        const rangeNewestFirst = headPath.slice(0, selectedIndex + 1);
        if (rangeNewestFirst.some((candidate) => candidate.isMerge)) {
          setToast({ msg: 'Interaktiver Rebase mit Merge-Commits wird hier nicht unterstuetzt.', isError: true });
          return;
        }

        const rangeOldestFirst = [...rangeNewestFirst].reverse();
        const defaultTodo = rangeOldestFirst.map((candidate) => `pick ${candidate.commit.hash} ${candidate.commit.subject}`).join('\n');

        const baseHash = selectedNode.commit.parentHashes[0];

        setInputDialog({
          title: 'Interaktiven Rebase starten',
          message: 'Bearbeite die Rebase-Todo-Liste (pick/reword/edit/squash/fixup/drop).',
          fields: [
            {
              id: 'todo',
              label: 'Rebase Todo',
              defaultValue: defaultTodo,
              required: true,
              multiline: true,
              helperText: 'Eine Zeile pro Commit, z.B. "pick <hash> <message>"',
            },
          ],
          contextItems: [
            { label: 'Basis', value: baseHash.slice(0, 8) },
            { label: 'Commit-Anzahl', value: String(rangeOldestFirst.length) },
          ],
          irreversible: false,
          consequences: 'Commits werden lokal umgeschrieben. Bei Konflikten Rebase continue/abort im Working Directory nutzen.',
          confirmLabel: 'Rebase starten',
          onSubmit: async (values) => {
            const lines = (values.todo || '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);

            if (lines.length === 0 || !gitClient.isAvailable()) return;

            const result = await gitClient.startInteractiveRebase(baseHash, lines);
            if (!result.success) {
              setToast({ msg: result.error || 'Interaktiver Rebase fehlgeschlagen.', isError: true });
              return;
            }

            setToast({ msg: 'Interaktiver Rebase gestartet.', isError: false });
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
      label: 'Commit-Hash kopieren',
      icon: 'ID',
      action: () => {
        navigator.clipboard.writeText(hash);
        setToast({ msg: 'Hash kopiert!', isError: false });
      },
    },
  ];

  if (node.isMerge) {
    actions.splice(3, 0, {
      label: `Revert Merge ${shortHash}`,
      icon: 'MR',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: 'Merge-Revert ausfuehren?',
          message: 'Der Merge-Commit wird mit Parent 1 als Hauptlinie reverted.',
          contextItems: [
            { label: 'Merge-Commit', value: shortHash },
            { label: 'Parent', value: '1' },
          ],
          irreversible: false,
          consequences: 'Es entsteht ein neuer Revert-Commit und moegliche Konflikte muessen geloest werden.',
          confirmLabel: 'Merge-Revert',
          onConfirm: async () => {
            await runGitAction(gitClient.buildRevertCommitArgs(hash, { mainline: 1, noEdit: true }), `Merge-Revert von ${shortHash} erfolgreich.`);
          },
        });
      },
    });
  }

  return actions;
};
