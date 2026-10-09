import { useI18n } from '@/i18n';
import type { GitPullConfigurationDto, PullStrategy, RemotePreferences } from '@/types/remoteTransfers';

function configuredBehavior(configuration: GitPullConfigurationDto, tr: (de: string, en: string) => string): string {
  const { rebase, fastForward } = configuration;
  if (fastForward?.value === 'only') return tr('Nur Fast-forward', 'Fast-forward only');
  if (rebase?.value === 'merges') return tr('Rebase mit Merge-Commits', 'Rebase preserving merge commits');
  if (rebase?.value === 'interactive') return tr('Interaktiver Rebase', 'Interactive rebase');
  if (rebase?.value === 'true') return 'Rebase';
  if (rebase || fastForward?.key === 'pull.ff') {
    return fastForward?.value === 'false'
      ? tr('Merge mit Merge-Commit', 'Merge with a merge commit')
      : tr('Merge, Fast-forward erlaubt', 'Merge, fast-forward allowed');
  }
  return tr(
    'Keine explizite Pull-Strategie konfiguriert; es gilt der Standard deiner Git-Version.',
    'No explicit pull strategy configured; your Git version determines the default.',
  );
}

export function RemotePullStrategy({
  preferences,
  configuration,
  update,
  disabled,
}: {
  preferences: RemotePreferences;
  configuration: GitPullConfigurationDto | null;
  update: (next: RemotePreferences) => void;
  disabled: boolean;
}) {
  const { tr } = useI18n();
  return (
    <>
      <label>
        {tr('Pull-Strategie', 'Pull strategy')}
        <select
          aria-label={tr('Pull-Strategie', 'Pull strategy')}
          disabled={disabled}
          value={preferences.pullStrategy ?? 'default'}
          onChange={(event) => update({ ...preferences, pullStrategy: event.target.value as PullStrategy })}
        >
          <option value="default">{tr('Git-Standard verwenden', 'Use Git default')}</option>
          <option value="rebase">{tr('Rebase — lokale Commits neu anwenden', 'Rebase — replay local commits')}</option>
          <option value="merge">{tr('Merge — Historien zusammenführen', 'Merge — combine histories')}</option>
          <option value="ff-only">{tr('Nur Fast-forward — ohne neue Merge-Commits', 'Fast-forward only — without new merge commits')}</option>
        </select>
      </label>
      {(preferences.pullStrategy ?? 'default') === 'default' && configuration && (
        <div className="remote-configuration__pull-behavior">
          <small>
            {tr('Wirksame Git-Konfiguration', 'Effective Git configuration')}: {configuredBehavior(configuration, tr)}
          </small>
          {(configuration.rebase || configuration.fastForward || configuration.mergeOptions) && (
            <details className="remote-configuration__git-details">
              <summary>{tr('Git-Konfigurationswerte anzeigen', 'Show Git configuration values')}</summary>
              {[configuration.rebase, configuration.fastForward]
                .filter((entry) => entry !== null)
                .map((entry) => (
                  <code key={entry.key}>
                    {entry.key} = {entry.value}
                  </code>
                ))}
              {configuration.mergeOptions && (
                <code>
                  branch.{configuration.branch}.mergeOptions = {configuration.mergeOptions}
                </code>
              )}
            </details>
          )}
        </div>
      )}
      {(preferences.pullStrategy ?? 'default') === 'default' && !configuration && (
        <small>{tr('Die wirksame Git-Konfiguration ist derzeit nicht verfügbar.', 'The effective Git configuration is currently unavailable.')}</small>
      )}
      {preferences.pullStrategy === 'rebase' && (
        <small>{tr('Lokale Commits auf dem abgerufenen Stand neu anwenden.', 'Replay local commits on top of the fetched changes.')}</small>
      )}
      {preferences.pullStrategy === 'merge' && (
        <small>{tr('Historien zusammenführen; bei Bedarf einen Merge-Commit erstellen.', 'Combine histories and create a merge commit when needed.')}</small>
      )}
      {preferences.pullStrategy === 'ff-only' && (
        <small>
          {tr(
            'Nur vorwärts aktualisieren. Bei auseinander gelaufenen Branches wird der Pull gestoppt.',
            'Only move the branch forward. Stop the pull if the branches have diverged.',
          )}
        </small>
      )}
      <small>
        {tr(
          'Gilt für normale Pulls dieses Repositorys. Die Auswahl im Pull-Dropdown gilt nur einmalig.',
          'Applies to normal pulls in this repository. Choices in the pull dropdown apply only once.',
        )}
      </small>
    </>
  );
}
