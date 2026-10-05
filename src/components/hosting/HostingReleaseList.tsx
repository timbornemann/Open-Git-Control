import { Button } from '@/components/ui/Button';
import { ExternalLink, Tag } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
      <div className="hosting-item-heading">
        <h3>{release.name || release.tagName}</h3>
        <div className="hosting-item-meta">
          <StatusBadge icon={<Tag size={12} />}>{release.tagName}</StatusBadge>
          {release.draft && <StatusBadge tone="warning">Draft</StatusBadge>}
          {release.prerelease && <StatusBadge tone="info">Prerelease</StatusBadge>}
        </div>
      </div>
      {release.body && <pre className="hosting-notes">{release.body}</pre>}
      <div className="hosting-actions">
        <Button variant="ghost" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(release.htmlUrl)}>
          {tr('Öffnen', 'Open')}
        </Button>
      </div>
      {showAssets && <ReleaseAttachments repository={repository} releaseId={release.id} />}
    </article>
  ));
}
