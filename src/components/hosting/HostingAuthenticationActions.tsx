import { Button } from '@/components/ui/Button';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { openSystemTools, useSystemTools } from '@/app/state/systemToolsStore';
import { useI18n } from '@/i18n';
import type { BrowserRequirement } from './hostingConnectionRequirements';

export function HostingAuthenticationActions({
  busy,
  token,
  requirement,
  configure,
  signIn,
  signInWithCli,
}: {
  busy: boolean;
  token: boolean;
  requirement: BrowserRequirement | null;
  configure: () => void;
  signIn: () => void;
  signInWithCli?: () => void;
}) {
  const { tr } = useI18n();
  const cliState = useSystemTools((state) => state.status?.tools.find((tool) => tool.id === 'github-cli')?.state);
  const cliUnavailable = cliState === 'missing' || cliState === 'unusable';
  return (
    <div className="hosting-actions">
      <Button type="submit" variant="primary" disabled={busy}>
        {token ? tr('Mit Token anmelden', 'Sign in with token') : tr('Speichern', 'Save')}
      </Button>
      <ActionRequirement reason={!busy ? requirement?.reason : null} remedy={{ label: tr('OAuth einrichten', 'Configure OAuth'), onClick: configure }}>
        <Button type="button" disabled={busy || Boolean(requirement)} onClick={signIn}>
          {tr('Im Browser anmelden', 'Sign in in browser')}
        </Button>
      </ActionRequirement>
      {signInWithCli && (
        <ActionRequirement
          reason={!busy && cliUnavailable ? tr('GitHub CLI ist nicht verfügbar.', 'GitHub CLI is unavailable.') : null}
          remedy={{ label: tr('Werkzeuge öffnen', 'Open tools'), onClick: () => openSystemTools('github-cli') }}
        >
          <Button type="button" disabled={busy || cliUnavailable} onClick={signInWithCli}>
            GitHub CLI
          </Button>
        </ActionRequirement>
      )}
    </div>
  );
}
