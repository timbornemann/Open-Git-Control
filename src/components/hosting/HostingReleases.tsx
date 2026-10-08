import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Download, FolderOpen, Loader2, RefreshCw, Tag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { hostingClient } from '@/services/hostingClient';
import { useAppStateReader, useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingCapabilities, HostingPage, HostingRelease } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingReleaseFiles } from './HostingReleaseFiles';
import { HostingReleaseList } from './HostingReleaseList';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import './hosting-releases.css';

export function HostingReleases({
  repository,
  capabilities,
  repoPath,
  localPaths = [],
  onClone,
}: {
  repository: HostedRepository;
  capabilities: HostingCapabilities;
  repoPath: string | null;
  localPaths?: string[];
  onClone?: (repository: HostedRepository) => void;
}) {
  const { tr } = useI18n();
  const readAppState = useAppStateReader();
  const activeRepo = useGitStore((state) => state.activeRepo);
  const revision = useHostingState((state) => state.revision);
  const refresh = useHostingState((state) => state.refresh);
  const task = useHostingTask(hostedRepositoryKey(repository));
  const { run } = task;
  const [page, setPage] = useState<HostingPage<HostingRelease>>({ items: [], nextCursor: null });
  const [selectedPath, setSelectedPath] = useState('');
  const [pendingPath, setPendingPath] = useState('');
  const cloneField = useRef<HTMLSelectElement>(null);
  const paths = [...new Set([...(repoPath ? [repoPath] : []), ...localPaths])];
  const path = paths.find((candidate) => normalizeRepoPathKey(candidate) === normalizeRepoPathKey(selectedPath)) || (paths.length === 1 ? paths[0] : '');
  const reload = useCallback(() => hostingClient.request('releases', { repository: repository.ref }), [repository]);
  useEffect(() => {
    setPage({ items: [], nextCursor: null });
    void run(reload, setPage);
  }, [reload, revision, run]);
  useEffect(() => {
    if (!pendingPath || normalizeRepoPathKey(activeRepo || '') !== normalizeRepoPathKey(pendingPath)) return;
    setPendingPath('');
    readAppState().ui.onOpenReleaseCreator(repository.ref);
  }, [pendingPath, activeRepo, repository.ref, readAppState]);
  const openCreator = () =>
    void task.run(
      async () => {
        if (!path) return '';
        const active = readAppState().repository.activeRepo;
        if (normalizeRepoPathKey(active || '') !== normalizeRepoPathKey(path)) {
          const opened = await readAppState().repository.onSwitchRepo(path);
          if (!opened) return '';
        }
        return path;
      },
      (openedPath) => setPendingPath(openedPath),
    );
  return (
    <div className="hosting-releases">
      <header className="hosting-releases-toolbar">
        <div className="hosting-releases-toolbar__title">
          <Tag size={17} aria-hidden="true" />
          <h2>{capabilities.releases === 'native' ? tr('Release-Verlauf', 'Release history') : tr('Tag-Verlauf', 'Tag history')}</h2>
          {page.items.length > 0 && <span title={tr('Geladene Versionen', 'Loaded versions')}>{page.items.length}</span>}
        </div>
        <div className="hosting-releases-toolbar__actions">
          {paths.length > 1 && (
            <select
              ref={cloneField}
              className="ui-field"
              aria-label={tr('Lokaler Klon', 'Local clone')}
              value={path}
              onChange={(event) => setSelectedPath(event.target.value)}
              disabled={task.busy}
            >
              <option value="" disabled>
                {tr('Klon auswählen', 'Choose clone')}
              </option>
              {paths.map((localPath) => (
                <option key={localPath} value={localPath}>
                  {localPath}
                </option>
              ))}
            </select>
          )}
          <Button icon={<RefreshCw size={14} />} disabled={task.busy} onClick={refresh}>
            {tr('Aktualisieren', 'Refresh')}
          </Button>
          {paths.length ? (
            <ActionRequirement
              reason={!task.busy && !path ? tr('Wähle den lokalen Klon für die Release-Erstellung.', 'Choose the local clone for release creation.') : null}
              remedy={{ label: tr('Klon auswählen', 'Choose clone'), onClick: () => cloneField.current?.focus() }}
            >
              <Button variant="primary" icon={<Plus size={14} />} disabled={task.busy || !path} onClick={openCreator}>
                {capabilities.releases === 'native' ? tr('Release erstellen', 'Create release') : tr('Tag & Notes erstellen', 'Create tag & notes')}
              </Button>
            </ActionRequirement>
          ) : (
            <>
              {onClone && (
                <Button icon={<Download size={14} />} onClick={() => onClone(repository)}>
                  {tr('Für die Erstellung klonen', 'Clone to create a release')}
                </Button>
              )}
              <Button icon={<FolderOpen size={14} />} onClick={() => void readAppState().repository.onOpenFolder()}>
                {tr('Lokales Repository öffnen', 'Open local repository')}
              </Button>
            </>
          )}
        </div>
      </header>
      {capabilities.releases !== 'native' && (
        <p className="hosting-help">
          {capabilities.releases === 'downloads'
            ? tr('Dieser Anbieter verwendet Tags und separate Downloads.', 'This provider uses tags and separate downloads.')
            : tr(
                'Dieser Anbieter veröffentlicht Tags. Release-Notes können kopiert oder lokal gespeichert werden.',
                'This provider publishes tags. Release notes can be copied or saved locally.',
              )}
        </p>
      )}
      {capabilities.releases === 'downloads' && <HostingReleaseFiles repository={repository.ref} />}
      {page.items.length > 0 && (
        <HostingReleaseList repository={repository.ref} releases={page.items} showAssets={capabilities.releaseAssets && capabilities.releases === 'native'} />
      )}
      {!page.items.length && !task.busy && !task.error && (
        <div className="hosting-empty hosting-releases-empty">
          <Tag size={28} aria-hidden="true" />
          <h3>{capabilities.releases === 'native' ? tr('Noch keine Releases', 'No releases yet') : tr('Noch keine Tags', 'No tags yet')}</h3>
          <p>{tr('Neue Versionen lassen sich im Release-Creator vorbereiten.', 'Prepare new versions in the release creator.')}</p>
        </div>
      )}
      {page.nextCursor && (
        <div className="hosting-releases-pagination">
          <Button
            disabled={task.busy}
            onClick={() =>
              void task.run(
                () => hostingClient.request('releases', { repository: repository.ref, cursor: page.nextCursor! }),
                (next) => setPage((previous) => ({ ...next, items: [...previous.items, ...next.items] })),
              )
            }
          >
            {tr('Weitere laden', 'Load more')}
          </Button>
        </div>
      )}
      {task.busy && (
        <p className="hosting-releases-loading" role="status">
          <Loader2 size={15} className="spin" aria-hidden="true" />
          {capabilities.releases === 'native' ? tr('Releases werden geladen …', 'Loading releases …') : tr('Tags werden geladen …', 'Loading tags …')}
        </p>
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
