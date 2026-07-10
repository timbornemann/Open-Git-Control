import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import type { CatalogTranslateFn, TranslateFn } from '@/i18n';
import { gitClient, type GitCommandArgs } from '@/services/gitClient';
import type { BranchInfo } from '@/types/git';
import type { GraphNode } from '@/utils/graphLayout';
import { mergeTargetFromDecoratedRef, parseRemoteBranchRef } from '@/utils/gitParsing';
import { validateBranchName } from '@/utils/gitRefValidation';
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
  tr: TranslateFn;
};

const getBranchNameValidationMessage = (value: string, t: CatalogTranslateFn) => {
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
  tr,
}: BuildCommitRefMenuActionsParams): MenuAction[] => {
  const hash = node.commit.hash;
  const shortHash = node.commit.abbrevHash;
  const localBranchNames = new Set(branches.filter((branch) => branch.scope === 'local').map((branch) => branch.name));
  const checkoutCandidates: { label: string; args: GitCommandArgs; successMessage: string }[] = [];
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
            args: gitClient.buildCheckoutBranchArgs(parsedRemote.localBranchName),
            successMessage: tr(`Branch "${parsedRemote.localBranchName}" ausgecheckt.`, `Checked out branch "${parsedRemote.localBranchName}".`),
          });
        }
        continue;
      }

      const remoteKey = `remote:${parsedRemote.remoteRef}`;
      if (seenCheckoutTargets.has(remoteKey)) continue;
      seenCheckoutTargets.add(remoteKey);
      checkoutCandidates.push({
        label: parsedRemote.remoteRef,
        args: gitClient.buildCheckoutRemoteBranchArgs(parsedRemote.remoteRef),
        successMessage: tr(
          `Tracking-Branch "${parsedRemote.localBranchName}" aus "${parsedRemote.remoteRef}" ausgecheckt.`,
          `Checked out tracking branch "${parsedRemote.localBranchName}" from "${parsedRemote.remoteRef}".`,
        ),
      });
      continue;
    }

    const localKey = `local:${normalizedTarget}`;
    if (seenCheckoutTargets.has(localKey)) continue;
    seenCheckoutTargets.add(localKey);
    checkoutCandidates.push({
      label: normalizedTarget,
      args: gitClient.buildCheckoutBranchArgs(normalizedTarget),
      successMessage: tr(`Branch "${normalizedTarget}" ausgecheckt.`, `Checked out branch "${normalizedTarget}".`),
    });
  }

  const checkoutRefActions: MenuAction[] = checkoutCandidates.map((candidate) => ({
    label: tr(`Branch auschecken: ${candidate.label}`, `Check out branch: ${candidate.label}`),
    icon: 'CB',
    action: () => {
      void runGitAction(candidate.args, candidate.successMessage);
    },
  }));

  return [
    ...checkoutRefActions,
    {
      label: tr(`Neuen Branch von ${shortHash} erstellen...`, `Create new branch from ${shortHash}...`),
      icon: 'NB',
      action: () => {
        const suggested = `checkout-${shortHash}`;
        setInputDialog({
          title: tr('Branch aus Commit auschecken', 'Check out branch from commit'),
          message: tr(
            'Es wird ein neuer Branch auf Basis dieses Commits erstellt und ausgecheckt.',
            'A new branch will be created from this commit and checked out.',
          ),
          fields: [
            {
              id: 'name',
              label: tr('Neuer Branch-Name', 'New branch name'),
              defaultValue: suggested,
              required: true,
              validate: (value) => getBranchNameValidationMessage(value.trim(), t),
            },
          ],
          contextItems: [
            { label: tr('Commit', 'Commit'), value: shortHash },
            { label: tr('Aktion', 'Action'), value: 'checkout -b <name> <commit>' },
          ],
          irreversible: false,
          consequences: tr(
            'Du wechselst auf den neuen Branch. Der aktuelle Branch bleibt unveraendert.',
            'You will switch to the new branch. The current branch remains unchanged.',
          ),
          confirmLabel: tr('Branch erstellen', 'Create branch'),
          onSubmit: async (values) => {
            const name = (values.name || '').trim();
            if (!name) return;
            await runGitAction(
              gitClient.buildCreateBranchArgs(name, hash),
              tr(`Branch "${name}" aus ${shortHash} ausgecheckt.`, `Checked out branch "${name}" from ${shortHash}.`),
            );
          },
        });
      },
    },
    {
      label: tr('Nur Commit (detached HEAD) auschecken...', 'Check out commit only (detached HEAD)...'),
      icon: '!',
      action: () => {
        setConfirmDialog({
          variant: 'confirm',
          title: tr('Detached HEAD aktivieren?', 'Enter detached HEAD state?'),
          message: tr(
            'Du checkst direkt auf den Commit aus und arbeitest temporaer ohne Branch.',
            'You will check out the commit directly and temporarily work without a branch.',
          ),
          contextItems: [
            { label: tr('Commit', 'Commit'), value: shortHash },
            { label: tr('Modus', 'Mode'), value: 'Detached HEAD' },
          ],
          irreversible: false,
          consequences: tr(
            'Neue Commits sind spaeter schwerer auffindbar, bis du einen Branch erstellst.',
            'New commits may be harder to find until you create a branch.',
          ),
          confirmLabel: tr('Trotzdem auschecken', 'Check out anyway'),
          onConfirm: async () => {
            await runGitAction(
              gitClient.buildCheckoutRefArgs(hash),
              tr(`Checkout zu ${shortHash} (detached HEAD) erfolgreich.`, `Successfully checked out ${shortHash} (detached HEAD).`),
            );
          },
        });
      },
    },
    {
      label: tr('Neuen Branch erstellen...', 'Create new branch...'),
      icon: 'B',
      action: () => {
        setInputDialog({
          title: tr('Neuen Branch erstellen', 'Create new branch'),
          message: tr('Der neue Branch zeigt auf den ausgewaehlten Commit.', 'The new branch will point to the selected commit.'),
          fields: [
            {
              id: 'name',
              label: tr('Branch-Name', 'Branch name'),
              required: true,
              validate: (value) => getBranchNameValidationMessage(value.trim(), t),
            },
          ],
          contextItems: [{ label: tr('Commit', 'Commit'), value: shortHash }],
          irreversible: false,
          consequences: tr('Der Branch wird erstellt und direkt ausgecheckt.', 'The branch will be created and checked out immediately.'),
          confirmLabel: tr('Branch erstellen', 'Create branch'),
          onSubmit: async (values) => {
            const name = (values.name || '').trim();
            if (!name) return;
            await runGitAction(gitClient.buildCreateBranchArgs(name, hash), tr(`Branch "${name}" erstellt.`, `Created branch "${name}".`));
          },
        });
      },
    },
    {
      label: tr('Tag erstellen...', 'Create tag...'),
      icon: 'T',
      action: () => {
        setInputDialog({
          title: tr('Tag auf Commit erstellen', 'Create tag on commit'),
          message: tr('Lege einen Lightweight- oder annotierten Tag an.', 'Create a lightweight or annotated tag.'),
          fields: [
            {
              id: 'name',
              label: tr('Tag-Name', 'Tag name'),
              required: true,
              placeholder: 'v1.2.3',
            },
            {
              id: 'message',
              label: tr('Tag-Nachricht (optional)', 'Tag message (optional)'),
              placeholder: tr('Leer lassen fuer Lightweight-Tag', 'Leave empty for a lightweight tag'),
            },
          ],
          contextItems: [{ label: tr('Commit', 'Commit'), value: shortHash }],
          irreversible: false,
          consequences: tr(
            'Der Tag markiert diesen Commit lokal. Der Push zum Remote erfolgt separat.',
            'The tag marks this commit locally. Pushing it to the remote is a separate action.',
          ),
          confirmLabel: tr('Tag erstellen', 'Create tag'),
          onSubmit: async (values) => {
            const name = (values.name || '').trim();
            if (!name) return;
            const msg = (values.message || '').trim();
            if (msg) {
              await runGitAction(gitClient.buildCreateTagArgs(name, { message: msg, target: hash }), tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
            } else {
              await runGitAction(gitClient.buildCreateTagArgs(name, { target: hash }), tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
            }
          },
        });
      },
    },
  ];
};
