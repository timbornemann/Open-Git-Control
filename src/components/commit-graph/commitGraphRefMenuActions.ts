import type { ConfirmDialogState, InputDialogState } from '../layout/layoutTypes';
import type { CatalogTranslateFn } from '../../i18n';
import type { BranchInfo } from '../../types/git';
import type { GraphNode } from '../../utils/graphLayout';
import {
  mergeTargetFromDecoratedRef,
  parseRemoteBranchRef,
} from '../../utils/gitParsing';
import { validateBranchName } from '../../utils/gitRefValidation';
import type { MenuAction } from './CommitContextMenu';
import { sortRefs } from './commitGraphRefs';

type BuildCommitRefMenuActionsParams = {
  node: GraphNode;
  branches: BranchInfo[];
  currentBranch: string;
  runGitAction: (args: string[], successMsg: string) => Promise<void> | void;
  setConfirmDialog: (value: ConfirmDialogState | null) => void;
  setInputDialog: (value: InputDialogState | null) => void;
  t: CatalogTranslateFn;
};

const getBranchNameValidationMessage = (
  value: string,
  t: CatalogTranslateFn,
) => {
  const errorCode = validateBranchName(value);
  if (!errorCode) return null;

  if (errorCode === 'contains-space') {
    return t('commitGraph.refMenu.branchNameNoSpaces');
  }

  return t('commitGraph.refMenu.invalidBranchName');
};

export const buildCommitRefMenuActions = ({
  node,
  branches,
  currentBranch,
  runGitAction,
  setConfirmDialog,
  setInputDialog,
  t,
}: BuildCommitRefMenuActionsParams): MenuAction[] => {
  const hash = node.commit.hash;
  const shortHash = node.commit.abbrevHash;
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

  return [
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
              validate: (value) => getBranchNameValidationMessage(value.trim(), t),
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
              validate: (value) => getBranchNameValidationMessage(value.trim(), t),
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
  ];
};
