import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import type { GitHubReleaseTargetDto } from '@/types/githubDtos';

export function releaseTargetDialog(
  target: GitHubReleaseTargetDto,
  repository: string,
  tr: (de: string, en: string) => string,
  continueWith: (mode: 'remote' | 'push-local') => Promise<void>,
  cancel: () => void,
): ConfirmDialogState {
  return {
    variant: 'confirm',
    title: tr('Ungepushte Commits vor dem Release', 'Unpushed commits before release'),
    message: tr(
      `${target.ahead === 1 ? 'Ein lokaler Commit fehlt' : `${target.ahead} lokale Commits fehlen`} auf GitHub. Möchtest du ${target.ahead === 1 ? 'ihn' : 'sie'} vor dem Release hochladen?`,
      `${target.ahead === 1 ? 'One local commit is missing' : `${target.ahead} local commits are missing`} on GitHub. Upload ${target.ahead === 1 ? 'it' : 'them'} before creating the release?`,
    ),
    contextItems: [
      { label: tr('Repository', 'Repository'), value: repository },
      { label: tr('Ziel-Branch', 'Target branch'), value: target.targetBranch || target.target },
      { label: tr('Lokaler Commit', 'Local commit'), value: target.localSha?.slice(0, 12) || '—' },
      {
        label: tr('Commit auf GitHub', 'Commit on GitHub'),
        value: target.remoteSha?.slice(0, 12) || tr('Branch noch nicht vorhanden', 'Branch does not exist yet'),
      },
      ...(target.pushBlockedReason ? [{ label: tr('Push nicht möglich', 'Push unavailable'), value: target.pushBlockedReason }] : []),
    ],
    irreversible: true,
    consequences: tr(
      'Ohne Push enthält der Release die lokalen Commits nicht. Release-Notes bleiben unverändert.',
      'Without pushing, the release excludes the local commits. Release notes remain unchanged.',
    ),
    confirmLabel: target.canPush ? tr('Pushen und Release erstellen', 'Push and create release') : tr('Ohne Push erstellen', 'Create without pushing'),
    onConfirm: () => continueWith(target.canPush ? 'push-local' : 'remote'),
    secondaryActionLabel: target.canPush && target.canReleaseRemote ? tr('Ohne Push erstellen', 'Create without pushing') : undefined,
    onSecondaryAction: target.canPush && target.canReleaseRemote ? () => continueWith('remote') : undefined,
    onCancel: cancel,
  };
}
