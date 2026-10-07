import { Button } from '@/components/ui/Button';
import { ChevronRight, ExternalLink, Paperclip, Tag } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useId, useState } from 'react';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import type { HostedRepositoryRef, HostingRelease } from '@/types/hostingDtos';
import { formatDate, formatDateTime } from '@/utils/dateTime';
import { HostingReleaseFiles } from './HostingReleaseFiles';
import { HostingReleaseNotes } from './HostingReleaseNotes';
import './hosting-releases.css';

function ReleaseAttachments({ repository, releaseId }: { repository: HostedRepositoryRef; releaseId: string }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <details className="hosting-release-attachments" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <ChevronRight size={13} className="hosting-release-attachments__chevron" aria-hidden="true" />
        <Paperclip size={13} aria-hidden="true" />
        {tr('Dateianhänge', 'Attachments')}
      </summary>
      {open && <HostingReleaseFiles repository={repository} releaseId={releaseId} embedded />}
    </details>
  );
}

function ReleaseEntry({ repository, release, showAssets }: { repository: HostedRepositoryRef; release: HostingRelease; showAssets: boolean }) {
  const { tr, locale } = useI18n();
  const titleId = useId();
  const hasDate = Boolean(release.publishedAt && Number.isFinite(new Date(release.publishedAt).getTime()) && !release.draft);
  return (
    <article className="hosting-release" role="listitem" aria-labelledby={titleId}>
      <div className="hosting-release__meta">
        <span className="hosting-release__version">
          <Tag size={15} aria-hidden="true" />
          {release.tagName}
        </span>
        {hasDate && (
          <time dateTime={release.publishedAt} title={formatDateTime(release.publishedAt!, locale, { dateStyle: 'long', timeStyle: 'short' })}>
            {formatDate(release.publishedAt!, locale, { dateStyle: 'medium' })}
          </time>
        )}
        <div className="hosting-release__states">
          {release.draft && <StatusBadge tone="warning">{tr('Entwurf', 'Draft')}</StatusBadge>}
          {release.prerelease && <StatusBadge tone="info">{tr('Vorabversion', 'Prerelease')}</StatusBadge>}
        </div>
      </div>
      <div className="hosting-release__content">
        <header className="hosting-release__header">
          <h3 id={titleId}>{release.name || release.tagName}</h3>
          <Button size="xs" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(release.htmlUrl)}>
            {tr('Im Browser öffnen', 'Open in browser')}
          </Button>
        </header>
        <HostingReleaseNotes body={release.body} />
        {showAssets && <ReleaseAttachments repository={repository} releaseId={release.id} />}
      </div>
    </article>
  );
}

export function HostingReleaseList({ repository, releases, showAssets }: { repository: HostedRepositoryRef; releases: HostingRelease[]; showAssets: boolean }) {
  const { tr } = useI18n();
  return (
    <div className="hosting-release-history" role="list" aria-label={tr('Release-Verlauf', 'Release history')}>
      {releases.map((release) => (
        <ReleaseEntry
          key={`${repository.connectionId}:${repository.repositoryId}:${repository.fullPath}:${release.id}`}
          repository={repository}
          release={release}
          showAssets={showAssets}
        />
      ))}
    </div>
  );
}
