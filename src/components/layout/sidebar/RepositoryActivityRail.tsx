import { useRef, useState } from 'react';
import { useGitStore, useUIStore } from '@/contexts/AppStateContext';
import { useRepositoryActivity } from '@/hooks/useRepositoryActivity';
import { useAppToast } from '@/hooks/useAppToast';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { useI18n } from '@/i18n';
import { RepositoryIcon } from '@/components/repository-icon/RepositoryIcon';
import { useRepositoryIconMenu } from '@/components/repository-icon/RepositoryIconMenu';

export function RepositoryActivityRail() {
  const repositories = useGitStore((state) => state.openRepos);
  const activeRepo = useGitStore((state) => state.activeRepo);
  const restoring = useGitStore((state) => state.isRestoringRepos);
  const switchRepo = useGitStore((state) => state.onSwitchRepo);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const closeRunConfig = useUIStore((state) => state.onCloseRunConfig);
  const entries = useRepositoryActivity(repositories, activeRepo, restoring);
  const { tr, locale } = useI18n();
  const toast = useAppToast();
  const switching = useRef(false);
  const [busy, setBusy] = useState(false);
  const logoMenu = useRepositoryIconMenu();

  const openRepository = async (path: string) => {
    if (switching.current) return;
    switching.current = true;
    setBusy(true);
    try {
      if (await switchRepo(path)) {
        setActiveTab('repo');
        closeRunConfig();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : tr('Repository konnte nicht geöffnet werden.', 'Could not open the repository.'), true);
    } finally {
      switching.current = false;
      setBusy(false);
    }
  };

  if (!entries.length) return null;
  return (
    <div className="repository-activity-group" role="group" aria-label={tr('Repositories mit Änderungen', 'Repositories with changes')}>
      <div className="repository-activity-rail">
        {entries.map((entry) => {
          const active = normalizeRepoPathKey(entry.path) === normalizeRepoPathKey(activeRepo || '');
          const countLabel =
            entry.changeCount === 1
              ? tr('1 geänderte Datei', '1 changed file')
              : tr(`${entry.changeCount} geänderte Dateien`, `${entry.changeCount} changed files`);
          const title = `${entry.name}\n${entry.path}\n${countLabel}${entry.failed ? `\n${tr('Aktualisierung fehlgeschlagen. Letzter Stand:', 'Refresh failed. Last checked:')} ${new Date(entry.checkedAt).toLocaleString(locale)}` : ''}`;
          return (
            <button
              type="button"
              key={normalizeRepoPathKey(entry.path)}
              className={`icon-btn repository-activity-button${active ? ' active' : ''}`}
              title={title}
              aria-label={`${entry.name}: ${countLabel}${active ? tr(', aktives Repository', ', active repository') : ''}`}
              aria-current={active ? 'true' : undefined}
              aria-disabled={busy}
              onClick={() => void openRepository(entry.path)}
              onContextMenu={(event) => logoMenu.open(event, entry.path)}
              onKeyDown={(event) => logoMenu.keyboard(event, entry.path)}
              onFocus={(event) => event.currentTarget.scrollIntoView?.({ block: 'nearest' })}
            >
              <RepositoryIcon repoPath={entry.path} name={entry.name} />
              <span className="repository-activity-count" aria-hidden="true">
                {entry.changeCount}
              </span>
            </button>
          );
        })}
      </div>
      {logoMenu.menu}
    </div>
  );
}
