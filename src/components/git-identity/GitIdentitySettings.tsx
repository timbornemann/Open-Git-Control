import { useOptionalActiveRepository } from '@/contexts/AppStateContext';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { GitIdentityFields } from './GitIdentityFields';
import { useGitIdentityForm } from './useGitIdentityForm';

function IdentitySettings({ repoPath }: { repoPath: string | null }) {
  const form = useGitIdentityForm(repoPath);
  const { tr } = useI18n();
  return (
    <div className="git-identity-settings">
      <GitIdentityFields form={form} repoPath={repoPath} />
      <div className="git-identity-actions">
        <Button disabled={!form.canSave} onClick={() => void form.save()}>
          {form.saving ? tr('Wird gespeichert …', 'Saving …') : tr('Speichern', 'Save')}
        </Button>
        <Button variant="ghost" disabled={form.loading || form.saving || !form.available} onClick={form.reload}>
          {tr('Neu laden', 'Reload')}
        </Button>
      </div>
    </div>
  );
}
export function GitIdentitySettings() {
  const repoPath = useOptionalActiveRepository();
  return <IdentitySettings key={repoPath || 'global'} repoPath={repoPath} />;
}
