import { Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { useUIStore } from '@/contexts/AppStateContext';
import { providerLabels } from '@/components/hosting/hostingState';
import { appClient } from '@/services/appClient';
import type { HostingConnection } from '@/types/hostingDtos';
import type { PublicationSelection, RepositoryPublication } from '@/types/repositoryPublication';
import { APPLICATION_OPEN_STAGING_COMMIT_EVENT } from '@/utils/layoutPreferences';
type Props = {
  record: RepositoryPublication;
  selection: PublicationSelection;
  connection?: HostingConnection;
  busy: boolean;
  publish: (options?: { confirmCandidate?: boolean; retryCreation?: boolean }) => Promise<void>;
};
export function PublicationSummary({ record, selection, connection, busy, publish }: Props) {
  const { tr } = useI18n();
  const onOpenRemoteConfig = useUIStore((s) => s.onOpenRemoteConfig);
  const created = Boolean(record.repository);
  return (
    <section className="publication-section">
      <dl className="publication-summary">
        <div>
          <dt>{tr('Hosting-Ziel', 'Hosting target')}</dt>
          <dd>
            {connection && providerLabels[connection.provider]} · {connection?.baseUrl}
            <br />
            {connection?.username} · {record.repository?.fullName || `${selection.creation.namespace}/${selection.creation.name}`}
          </dd>
        </div>
        <div>
          <dt>{tr('Verbindung', 'Connection')}</dt>
          <dd>
            {selection.remoteName} · {selection.transport.toUpperCase()} · {selection.creation.private ? tr('Privat', 'Private') : tr('Öffentlich', 'Public')}
          </dd>
        </div>
        <div>
          <dt>{tr('Zu übertragender Stand', 'Content to upload')}</dt>
          <dd>
            {record.commitCount ?? '—'} Commits · {record.branches.length} Branches · {record.tags.length} Tags
          </dd>
        </div>
      </dl>
      <ul className="publication-captured-refs">
        {record.branches.map((b) => (
          <li key={b.destinationBranch}>
            <span>
              {b.sourceBranch} → {b.destinationBranch}
            </span>
            <code>{b.sourceOid.slice(0, 12)}</code>
          </li>
        ))}
        {record.tags.map((t) => (
          <li key={`tag-${t.name}`}>
            <span>Tag {t.name}</span>
            <code>{t.oid.slice(0, 12)}</code>
          </li>
        ))}
      </ul>
      {created && (
        <div className="publication-status">
          <Check size={15} />
          <span>
            {tr('Repository erstellt', 'Repository created')}: {record.repository!.fullName} ·{' '}
            {record.stage === 'setup-pending'
              ? tr('Upload bestätigt · Einrichtung ausstehend', 'Upload verified · Setup pending')
              : record.stage === 'uploaded'
                ? tr('Upload bestätigt', 'Upload verified')
                : record.stage === 'connected'
                  ? tr('verbunden', 'connected')
                  : tr('Verbindung ausstehend', 'Connection pending')}
          </span>
        </div>
      )}
      {record.stage === 'uncertain' && (
        <div className="publication-prerequisite">
          <p>
            {tr(
              'Die Erstellung wurde unterbrochen. Der Serverstand wird vor einer Fortsetzung geprüft; es wird kein zweites Repository angelegt.',
              'Creation was interrupted. The server state is checked before resuming; no second repository is created.',
            )}
          </p>
          {record.candidate && (
            <>
              <p>
                {record.candidate.fullName} · {record.candidate.htmlUrl}
              </p>
              <Button disabled={busy} onClick={() => void publish({ confirmCandidate: true })}>
                {tr('Dieses geprüfte Repository ausdrücklich übernehmen', 'Explicitly use this verified repository')}
              </Button>
            </>
          )}
          {!record.candidate && record.message && (
            <Button disabled={busy} onClick={() => void publish({ retryCreation: true })}>
              {tr('Server erneut prüfen und Erstellung wiederholen', 'Check server again and retry creation')}
            </Button>
          )}
        </div>
      )}
      {!record.branches.length && created && (
        <Button disabled={busy} onClick={() => window.dispatchEvent(new Event(APPLICATION_OPEN_STAGING_COMMIT_EVENT))}>
          {tr('Ersten Commit im Staging erstellen', 'Make first commit in Staging')}
        </Button>
      )}
      {created && (
        <Button variant="ghost" icon={<ExternalLink size={14} />} onClick={() => void appClient.openExternalUrl(record.repository!.htmlUrl)}>
          {tr('Repository beim Anbieter öffnen', 'Open hosted repository')}
        </Button>
      )}
      <Button variant="ghost" disabled={busy} onClick={onOpenRemoteConfig}>
        {tr('Remote-Konfiguration', 'Remote configuration')}
      </Button>
    </section>
  );
}
