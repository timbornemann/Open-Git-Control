import { useCallback, useEffect, useState } from 'react';
import { Plus, Download, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { hostingClient } from '@/services/hostingClient';
import { useAppStateReader, useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingCapabilities, HostingPage, HostingRelease } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingReleaseFiles } from './HostingReleaseFiles';
import { HostingReleaseList } from './HostingReleaseList';
import { normalizeRepoPathKey } from '@/utils/repoPath';

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
  const task = useHostingTask(hostedRepositoryKey(repository));
  const { run } = task;
  const [page, setPage] = useState<HostingPage<HostingRelease>>({ items: [], nextCursor: null });
  const [selectedPath, setSelectedPath] = useState('');
  const [pendingPath, setPendingPath] = useState('');
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
      <div className="hosting-section-toolbar">
        <div>
          <h3>{capabilities.releases === 'native' ? 'Releases' : capabilities.releases === 'downloads' ? 'Tags & Downloads' : 'Tags & Notes'}</h3>
          <p className="hosting-help">
            {tr(
              'Neue Versionen im vollständigen Release-Creator vorbereiten und veröffentlichen.',
              'Prepare and publish new versions in the full release creator.',
            )}
          </p>
        </div>
        {paths.length > 1 && (
          <select
            className="release-select"
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
        {paths.length ? (
          <Button variant="primary" icon={<Plus size={14} />} disabled={task.busy || !path} onClick={openCreator}>
            {capabilities.releases === 'native' ? tr('Release erstellen', 'Create release') : tr('Tag & Notes erstellen', 'Create tag & notes')}
          </Button>
        ) : (
          <div className="hosting-actions">
            {onClone && (
              <Button icon={<Download size={14} />} onClick={() => onClone(repository)}>
                {tr('Für die Erstellung klonen', 'Clone to create a release')}
              </Button>
            )}
            <Button icon={<FolderOpen size={14} />} onClick={() => void readAppState().repository.onOpenFolder()}>
              {tr('Lokales Repository öffnen', 'Open local repository')}
            </Button>
          </div>
        )}
      </div>
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
      <HostingReleaseList repository={repository.ref} releases={page.items} showAssets={capabilities.releaseAssets && capabilities.releases === 'native'} />
      {page.nextCursor && (
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
      )}
      {task.busy && (
        <p className="hosting-notice" role="status">
          {tr('Laden …', 'Loading …')}
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
