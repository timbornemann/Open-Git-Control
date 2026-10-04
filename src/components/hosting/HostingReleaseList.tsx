import { useState } from 'react';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import type { HostedRepositoryRef, HostingRelease } from '@/types/hostingDtos';
import { HostingReleaseFiles } from './HostingReleaseFiles';

function ReleaseAttachments({ repository, releaseId }: { repository: HostedRepositoryRef; releaseId: string }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{tr('Dateianhänge', 'Attachments')}</summary>
      {open && <HostingReleaseFiles repository={repository} releaseId={releaseId} />}
    </details>
  );
}

export function HostingReleaseList({ repository, releases, showAssets }: { repository: HostedRepositoryRef; releases: HostingRelease[]; showAssets: boolean }) {
  const { tr } = useI18n();
  return releases.map((release) => (
    <article className="hosting-card" key={release.id}>
      <h3>{release.name || release.tagName}</h3>
      <small>
        {release.tagName}
        {release.draft ? ' · Draft' : ''}
        {release.prerelease ? ' · Prerelease' : ''}
      </small>
      {release.body && <pre className="hosting-notes">{release.body}</pre>}
      <button onClick={() => void appClient.openExternalUrl(release.htmlUrl)}>{tr('Öffnen', 'Open')}</button>
      {showAssets && <ReleaseAttachments repository={repository} releaseId={release.id} />}
    </article>
  ));
}
