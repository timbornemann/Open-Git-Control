import type { ConfirmDialogState, InputDialogState } from '../layout/layoutTypes';
import type { ToastMessage, BranchInfo } from '../../types/git';
import type { GraphLayout, GraphNode } from '../../utils/graphLayout';
import {
  mergeTargetFromDecoratedRef,
  parseRemoteBranchRef,
} from '../../utils/gitParsing';
import { validateBranchName } from '../../utils/gitRefValidation';
import { sortRefs } from './commitGraphRefs';
import type { MenuAction } from './CommitContextMenu';

type BuildCommitMenuActionsParams = {
  node: GraphNode;
  branches: BranchInfo[];
  currentBranch: string;
  layout: GraphLayout | null;
  reachableFromHead: Set<string>;
  runGitAction: (args: string[], successMsg: string) => Promise<void> | void;
  setConfirmDialog: (value: ConfirmDialogState | null) => void;
  setInputDialog: (value: InputDialogState | null) => void;
  setToast: (toast: ToastMessage | null) => void;
  refreshCommits: () => Promise<void> | void;
  refreshWorkingTreeStatus: () => Promise<void> | void;
  tr: (deText: string, enText: string) => string;
};

const getBranchNameValidationMessage = (
  value: string,
  tr: (deText: string, enText: string) => string,
) => {
  const errorCode = validateBranchName(value);
  if (!errorCode) return null;

  if (errorCode === 'contains-space') {
    return tr(
      'Branch-Name darf keine Leerzeichen enthalten.',
      'Branch name must not contain spaces.',
    );
  }

  return tr(
    'Ungueltiger Branch-Name. Vermeide Sonderzeichen wie ~ ^ : ? * [ \\ sowie .. und @{.',
    'Invalid branch name. Avoid special characters like ~ ^ : ? * [ \\ and patterns like .. or @{.',
  );
};

export const buildCommitMenuActions = ({
  node,
  branches,
  currentBranch,
  layout,
  reachableFromHead,
  runGitAction,
  setConfirmDialog,
  setInputDialog,
  setToast,
  refreshCommits,
  refreshWorkingTreeStatus,
  tr,
}: BuildCommitMenuActionsParams): MenuAction[] => {
  const hash = node.commit.hash;
  const shortHash = node.commit.abbrevHash;
  const isMerge = node.isMerge;
  const localBranchNames = new Set(
    branches
      .filter(branch => branch.scope === 'local')
      .map(branch => branch.name),
  );
  const checkoutCandidates: { label: string; args: string[]; successMessage: string }[] = [];
  const seenCheckoutTargets = new Set<string>();

  for (const ref of sortRefs(node.commit.refs)) {
    const mergeTarget = mergeTargetFromDecoratedRef(ref);
    if (!mergeTarget) continue;
    const normalizedTarget = mergeTarget.trim();
    if (!normalizedTarget) continue;
    if (normalizedTarget === currentBranch) continue;
    if (normalizedTarget.endsWith('/HEAD')) continue;

    const parsedRemote = parseRemoteBranchRef(normalizedTarget);
    if (parsedRemote) {
      if (localBranchNames.has(parsedRemote.localBranchName)) {
        const localKey = `local:${parsedRemote.localBranchName}`;
        if (!seenCheckoutTargets.has(localKey)) {
          seenCheckoutTargets.add(localKey);
          checkoutCandidates.push({
            label: parsedRemote.localBranchName,
            args: ['checkout', parsedRemote.localBranchName],
            successMessage: `Branch "${parsedRemote.localBranchName}" ausgecheckt.`,
          });
        }
        continue;
      }

      const remoteKey = `remote:${parsedRemote.remoteRef}`;
      if (seenCheckoutTargets.has(remoteKey)) continue;
      seenCheckoutTargets.add(remoteKey);
      checkoutCandidates.push({
        label: parsedRemote.remoteRef,
        args: ['checkout', '--track', parsedRemote.remoteRef],
        successMessage: `Tracking-Branch "${parsedRemote.localBranchName}" aus "${parsedRemote.remoteRef}" ausgecheckt.`,
      });
      continue;
    }

    const localKey = `local:${normalizedTarget}`;
    if (seenCheckoutTargets.has(localKey)) continue;
    seenCheckoutTargets.add(localKey);
    checkoutCandidates.push({
      label: normalizedTarget,
      args: ['checkout', normalizedTarget],
      successMessage: `Branch "${normalizedTarget}" ausgecheckt.`,
    });
  }

  const checkoutRefActions: MenuAction[] = checkoutCandidates.map(candidate => ({
    label: `Branch auschecken: ${candidate.label}`,
    icon: 'CB',
    action: () => {
      void runGitAction(candidate.args, candidate.successMessage);
    },
  }));

  const actions: MenuAction[] = [
    ...checkoutRefActions,
    {
      label: `Neuen Branch von ${shortHash} erstellen...`,
      icon: 'NB',
      action: () => {
        const suggested = `checkout-${shortHash}`;
        setInputDialog({
          title: 'Branch aus Commit auschecken',
          message: 'Es wird ein neuer Branch auf Basis dieses Commits erstellt und ausgecheckt.',
          fields: [
            {
              id: 'name',
              label: 'Neuer Branch-Name',
              defaultValue: suggested,
              required: true,
              validate: (value) => getBranchNameValidationMessage(value.trim(), tr),
            },
          ],
          contextItems: [
            { label: 'Commit', value: shortHash },
            { label: 'Aktion', value: 'checkout -b <name> <commit>' },
          ],
          irreversible: false,
          consequences: 'Du wechselst auf den neuen Branch. Der aktuelle Branch bleibt unveraendert.',
          confirmLabel: 'Branch erstellen',
          onSubmit: async (values) => {
            const name = (values.name || '').trim();
            if (!name) return;
            await runGitAction(['checkout', '-b', name, hash], `Branch "${name}" aus ${shortHash} ausgecheckt.`);
          },
        });
      },
    },
    {
      label: 'Nur Commit (detached HEAD) auschecken...',
      icon: '!',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: 'Detached HEAD aktivieren?',
          message: 'Du checkst direkt auf den Commit aus und arbeitest temporaer ohne Branch.',
          contextItems: [
            { label: 'Commit', value: shortHash },
            { label: 'Modus', value: 'Detached HEAD' },
          ],
          irreversible: false,
          consequences: 'Neue Commits sind spaeter schwerer auffindbar, bis du einen Branch erstellst.',
          confirmLabel: 'Trotzdem auschecken',
          onConfirm: async () => {
            await runGitAction(['checkout', hash], `Checkout zu ${shortHash} (detached HEAD) erfolgreich.`);
          },
        });
      },
    },
    {
      label: 'Neuen Branch erstellen...',
      icon: 'B',
      action: () => {
        setInputDialog({
          title: 'Neuen Branch erstellen',
          message: 'Der neue Branch zeigt auf den ausgewaehlten Commit.',
          fields: [
            {
              id: 'name',
              label: 'Branch-Name',
              required: true,
              validate: (value) => getBranchNameValidationMessage(value.trim(), tr),
            },
          ],
          contextItems: [
            { label: 'Commit', value: shortHash },
          ],
          irreversible: false,
          consequences: 'Der Branch wird erstellt und direkt ausgecheckt.',
          confirmLabel: 'Branch erstellen',
          onSubmit: async (values) => {
            const name = (values.name || '').trim();
            if (!name) return;
            await runGitAction(['checkout', '-b', name, hash], `Branch "${name}" erstellt.`);
          },
        });
      },
    },
    {
      label: 'Tag erstellen...',
      icon: 'T',
      action: () => {
        setInputDialog({
          title: 'Tag auf Commit erstellen',
          message: 'Lege einen lightweight oder annotierten Tag an.',
          fields: [
            {
              id: 'name',
              label: 'Tag-Name',
              required: true,
              placeholder: 'v1.2.3',
            },
            {
              id: 'message',
              label: 'Tag-Nachricht (optional)',
              placeholder: 'Leer lassen fuer lightweight Tag',
            },
          ],
          contextItems: [
            { label: 'Commit', value: shortHash },
          ],
          irreversible: false,
          consequences: 'Der Tag markiert diesen Commit lokal. Push auf Remote erfolgt separat.',
          confirmLabel: 'Tag erstellen',
          onSubmit: async (values) => {
            const name = (values.name || '').trim();
            if (!name) return;
            const msg = (values.message || '').trim();
            if (msg) {
              await runGitAction(['tag', '-a', name, '-m', msg, hash], `Tag "${name}" erstellt.`);
            } else {
              await runGitAction(['tag', name, hash], `Tag "${name}" erstellt.`);
            }
          },
        });
      },
    },
    {
      label: '', icon: '', separator: true, action: () => {},
    },
    {
      label: `Cherry-Pick ${shortHash}`,
      icon: 'CP',
      action: () => runGitAction(['cherry-pick', hash], `Cherry-Pick von ${shortHash} erfolgreich.`),
    },
    {
      label: `Revert ${shortHash}`,
      icon: 'RV',
      action: () => runGitAction(['revert', '--no-edit', hash], `Revert von ${shortHash} erfolgreich.`),
    },
    {
      label: '', icon: '', separator: true, action: () => {},
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
            await runGitAction(['reset', '--soft', hash], `Soft-Reset auf ${shortHash} erfolgreich.`);
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
            await runGitAction(['reset', '--mixed', hash], `Mixed-Reset auf ${shortHash} erfolgreich.`);
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
            await runGitAction(['reset', '--hard', hash], `Hard-Reset auf ${shortHash} erfolgreich.`);
          },
        });
      },
    },
    {
      label: `Interaktiver Rebase bis ${shortHash}`,
      icon: 'IR',
      action: () => {
        if (!layout) return;

        const selectedNode = layout.nodes.find(candidate => candidate.commit.hash === hash);
        if (!selectedNode) {
          setToast({ msg: 'Ausgewaehlter Commit wurde nicht gefunden.', isError: true });
          return;
        }

        if (selectedNode.commit.parentHashes.length === 0) {
          setToast({ msg: 'Root-Commit kann nicht interaktiv gerebased werden.', isError: true });
          return;
        }

        const headPath = layout.nodes.filter(candidate => reachableFromHead.has(candidate.commit.hash));
        const selectedIndex = headPath.findIndex(candidate => candidate.commit.hash === hash);
        if (selectedIndex < 0) {
          setToast({ msg: 'Commit liegt nicht auf dem aktuellen HEAD-Pfad.', isError: true });
          return;
        }

        const rangeNewestFirst = headPath.slice(0, selectedIndex + 1);
        if (rangeNewestFirst.some(candidate => candidate.isMerge)) {
          setToast({ msg: 'Interaktiver Rebase mit Merge-Commits wird hier nicht unterstuetzt.', isError: true });
          return;
        }

        const rangeOldestFirst = [...rangeNewestFirst].reverse();
        const defaultTodo = rangeOldestFirst
          .map(candidate => `pick ${candidate.commit.hash} ${candidate.commit.subject}`)
          .join('\n');

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
              .map(line => line.trim())
              .filter(Boolean);

            if (lines.length === 0 || !window.electronAPI) return;

            const result = await window.electronAPI.startInteractiveRebase(baseHash, lines);
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
      label: '', icon: '', separator: true, action: () => {},
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

  if (isMerge) {
    actions.splice(5, 0, {
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
            await runGitAction(['revert', '-m', '1', '--no-edit', hash], `Merge-Revert von ${shortHash} erfolgreich.`);
          },
        });
      },
    });
  }

  return actions;
};
