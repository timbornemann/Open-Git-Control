import { Button } from '@/components/ui/Button';
import { Download, ExternalLink, File, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { appClient } from '@/services/appClient';
import { hostingClient } from '@/services/hostingClient';
import type { HostedRepositoryRef, HostingPage, HostingReleaseAsset } from '@/types/hostingDtos';
import { useI18n } from '@/i18n';
import { useHostingTask } from './useHostingTask';
import { useHostingState } from './hostingState';
import './hosting-releases.css';

export function HostingReleaseFiles({ repository, releaseId, embedded = false }: { repository: HostedRepositoryRef; releaseId?: string; embedded?: boolean }) {
  const { tr } = useI18n();
  const revision = useHostingState((state) => state.revision);
  const task = useHostingTask(`${repository.connectionId}:${repository.repositoryId}:${repository.fullPath}:files:${releaseId ?? 'downloads'}`);
  const [page, setPage] = useState<HostingPage<HostingReleaseAsset>>({ items: [], nextCursor: null });
  const { run } = task;
  const reload = useCallback(() => hostingClient.request('releaseAssets', { repository, releaseId }), [repository, releaseId]);
  const label = releaseId ? tr('Dateianhänge', 'Attachments') : tr('Repository-Downloads', 'Repository downloads');
  useEffect(() => {
    setPage({ items: [], nextCursor: null });
    void run(reload, setPage);
  }, [reload, revision, run]);
  return (
    <section className={`hosting-release-files${embedded ? ' hosting-release-files--embedded' : ''}`} aria-label={label}>
      {!embedded && (
        <h3>
          <Download size={15} aria-hidden="true" />
          {label}
        </h3>
      )}
      {page.items.map((asset) => (
        <div className="hosting-release-file" key={asset.id}>
          <span className="hosting-release-file__identity">
            <File size={14} aria-hidden="true" />
            <span title={asset.name}>{asset.name}</span>
          </span>
          <Button
            size="xs"
            aria-label={asset.name}
            icon={<ExternalLink size={13} />}
            variant="ghost"
            onClick={() => void appClient.openExternalUrl(asset.htmlUrl)}
          >
            {tr('Öffnen', 'Open')}
          </Button>
        </div>
      ))}
      {!page.items.length && !task.busy && !task.error && (
        <p className="hosting-release-files__empty">{tr('Keine Dateien vorhanden.', 'No files available.')}</p>
      )}
      {page.nextCursor && (
        <Button
          disabled={task.busy}
          onClick={() =>
            void run(
              () => hostingClient.request('releaseAssets', { repository, releaseId, cursor: page.nextCursor! }),
              (next) => setPage((current) => ({ ...next, items: [...current.items, ...next.items] })),
            )
          }
        >
          {tr('Weitere Dateien laden', 'Load more files')}
        </Button>
      )}
      {task.busy && (
        <p className="hosting-releases-loading" role="status">
          <Loader2 size={14} className="spin" aria-hidden="true" />
          {tr('Dateien werden geladen …', 'Loading files …')}
        </p>
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </section>
  );
}
