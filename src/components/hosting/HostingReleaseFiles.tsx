import { useCallback, useEffect, useState } from 'react';
import { appClient } from '@/services/appClient';
import { hostingClient } from '@/services/hostingClient';
import type { HostedRepositoryRef, HostingPage, HostingReleaseAsset } from '@/types/hostingDtos';
import { useI18n } from '@/i18n';
import { useHostingTask } from './useHostingTask';
import { useHostingState } from './hostingState';

export function HostingReleaseFiles({ repository, releaseId }: { repository: HostedRepositoryRef; releaseId?: string }) {
  const { tr } = useI18n();
  const revision = useHostingState((state) => state.revision);
  const task = useHostingTask(`${repository.connectionId}:${repository.repositoryId}:${repository.fullPath}:files:${releaseId ?? 'downloads'}`);
  const [page, setPage] = useState<HostingPage<HostingReleaseAsset>>({ items: [], nextCursor: null });
  const { run } = task;
  const reload = useCallback(() => hostingClient.request('releaseAssets', { repository, releaseId }), [repository, releaseId]);
  useEffect(() => {
    setPage({ items: [], nextCursor: null });
    void run(reload, setPage);
  }, [reload, revision, run]);
  return (
    <section className="hosting-card">
      <h3>{releaseId ? tr('Dateianhänge', 'Attachments') : tr('Repository-Downloads', 'Repository downloads')}</h3>
      {page.items.map((asset) => (
        <button key={asset.id} onClick={() => void appClient.openExternalUrl(asset.htmlUrl)}>
          {asset.name}
        </button>
      ))}
      {!page.items.length && !task.busy && !task.error && <p>{tr('Keine Dateien vorhanden.', 'No files available.')}</p>}
      {page.nextCursor && (
        <button
          disabled={task.busy}
          onClick={() =>
            void run(
              () => hostingClient.request('releaseAssets', { repository, releaseId, cursor: page.nextCursor! }),
              (next) => setPage((current) => ({ ...next, items: [...current.items, ...next.items] })),
            )
          }
        >
          {tr('Weitere Dateien laden', 'Load more files')}
        </button>
      )}
      {task.busy && <p role="status">{tr('Dateien werden geladen …', 'Loading files …')}</p>}
      {task.error && <p role="alert">{task.error}</p>}
    </section>
  );
}
