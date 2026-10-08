import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import type { useGitIdentityForm } from './useGitIdentityForm';
import './git-identity.css';

export function GitIdentityFields({ form, repoPath }: { form: ReturnType<typeof useGitIdentityForm>; repoPath: string | null }) {
  const { tr } = useI18n();
  const disabled = !form.available || form.loading || form.saving;
  return (
    <div className="git-identity-fields" aria-busy={form.loading || form.saving}>
      <p className="git-identity-hint">
        {tr(
          'Name und E-Mail werden in neuen Commits gespeichert. Die Hosting-Anmeldung ist davon unabhängig; bestehende Commits bleiben unverändert.',
          'Name and email are recorded in new commits. Hosting sign-in is independent; existing commits are unchanged.',
        )}
      </p>
      <label className="git-identity-scope">
        <span>{tr('Geltungsbereich', 'Applies to')}</span>
        <select
          className="ui-field ui-field--sm"
          value={form.scope}
          disabled={disabled}
          onChange={(event) => form.setScope(event.target.value as 'repository' | 'global')}
        >
          {repoPath && <option value="repository">{tr('Dieses Repository', 'This repository')}</option>}
          <option value="global">{tr('Global auf diesem Computer', 'Globally on this computer')}</option>
        </select>
      </label>
      <p className="git-identity-hint git-identity-context">
        {form.scope === 'repository'
          ? repoPath
          : tr(
              'Gilt als Standard für alle Repositorys. Repository-Einstellungen haben Vorrang.',
              'Default for all repositories. Repository settings take precedence.',
            )}
      </p>
      <div className="git-identity-inputs">
        <label>
          <span>{tr('Git-Name', 'Git name')}</span>
          <TextField
            value={form.name}
            disabled={disabled}
            maxLength={200}
            autoComplete="name"
            spellCheck={false}
            onChange={(event) => form.setName(event.target.value)}
          />
        </label>
        <label>
          <span>{tr('Git-E-Mail', 'Git email')}</span>
          <TextField
            type="email"
            value={form.email}
            disabled={disabled}
            maxLength={254}
            autoComplete="email"
            spellCheck={false}
            placeholder="name@example.com"
            onChange={(event) => form.setEmail(event.target.value)}
          />
        </label>
      </div>
      {form.loading && (
        <p className="git-identity-hint" role="status">
          {tr('Git-Konfiguration wird geprüft …', 'Checking Git configuration …')}
        </p>
      )}
      {!form.available && <p className="git-identity-hint">{tr('Git-Konfiguration ist hier nicht verfügbar.', 'Git configuration is unavailable here.')}</p>}
      {form.failed && <Button onClick={form.reload}>{tr('Erneut prüfen', 'Check again')}</Button>}
    </div>
  );
}
