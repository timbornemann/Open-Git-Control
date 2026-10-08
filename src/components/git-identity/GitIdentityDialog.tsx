import { useLayoutEffect } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import { finishGitIdentitySetup, setGitIdentityRepository, useGitIdentityStore } from '@/app/state/gitIdentityStore';
import { GitIdentityFields } from './GitIdentityFields';
import { useGitIdentityForm } from './useGitIdentityForm';
import type { GitIdentityStatus } from '@/shared/ipc/gitIdentity';

function IdentitySetup({ id, repoPath, status }: { id: number; repoPath: string; status: GitIdentityStatus }) {
  const { tr } = useI18n();
  const form = useGitIdentityForm(repoPath, status);
  const save = async () => {
    if (await form.save(true)) finishGitIdentitySetup(id, true);
  };
  return (
    <DialogFrame
      open
      title={tr('Git-Commit-Identität einrichten', 'Set up Git commit identity')}
      closeOnBackdrop={false}
      onClose={() => {
        if (!form.saving) finishGitIdentitySetup(id, false);
      }}
      onConfirm={() => void save()}
      confirmDisabled={!form.canSave}
      confirmLabel={form.saving ? tr('Wird gespeichert …', 'Saving …') : tr('Speichern und fortfahren', 'Save and continue')}
      cancelLabel={tr('Abbrechen', 'Cancel')}
    >
      <GitIdentityFields form={form} repoPath={repoPath} />
    </DialogFrame>
  );
}

export function GitIdentityDialog({ activeRepo }: { activeRepo: string | null }) {
  const request = useGitIdentityStore((state) => state.request);
  useLayoutEffect(() => {
    setGitIdentityRepository(activeRepo);
  }, [activeRepo]);
  return request ? <IdentitySetup key={request.id} id={request.id} repoPath={request.repoPath} status={request.status} /> : null;
}
