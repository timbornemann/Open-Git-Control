import { useId } from 'react';
import { Box, ChevronRight, Download, ExternalLink, FileText, Layers, Loader2, Play, RotateCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import { formatDateTime } from '@/utils/dateTime';
import type { HostingArtifact, HostingCapabilities, HostingJob, HostingLog, HostingPage, HostingRun } from '@/types/hostingDtos';
import { HostingStateBadge } from './HostingStateBadge';
import { HostingCiRunMeta, HostingCiStatusIcon, isHostingRunActive } from './HostingCiRunList';

type Props = {
  run: HostingRun;
  capabilities: HostingCapabilities;
  jobs: HostingPage<HostingJob>;
  artifacts: HostingPage<HostingArtifact>;
  log: HostingLog | null;
  logName: string;
  busy: boolean;
  actionBusy: boolean;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onLog: (jobId?: string) => void;
  onMoreLog: () => void;
  onMoreJobs: () => void;
  onMoreArtifacts: () => void;
  onDownload: (id: string) => void;
  onManualJob: (id: string) => void;
};

const formatArtifactSize = (size: number, locale: string) => {
  const unit = Math.min(4, Math.max(0, Math.floor(Math.log2(Math.max(1, size)) / 10)));
  return `${(size / 1024 ** unit).toLocaleString(locale, { maximumFractionDigits: unit ? 1 : 0 })} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`;
};

function CiArtifact({ artifact, busy, onDownload }: { artifact: HostingArtifact; busy: boolean; onDownload: (id: string) => void }) {
  const { tr, locale } = useI18n();
  return (
    <div className="hosting-ci-artifact">
      <Box size={15} aria-hidden="true" />
      <div className="hosting-ci-artifact__identity">
        <strong>{artifact.name}</strong>
        <span>
          {artifact.size !== undefined && formatArtifactSize(artifact.size, locale)}
          {artifact.expiresAt && (
            <span>
              {tr('Verfügbar bis', 'Available until')} {formatDateTime(artifact.expiresAt, locale, { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </span>
      </div>
      {artifact.downloadable ? (
        <Button size="xs" icon={<Download size={13} />} disabled={busy} onClick={() => onDownload(artifact.id)}>
          {tr('Herunterladen', 'Download')}
        </Button>
      ) : artifact.htmlUrl ? (
        <Button size="xs" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(artifact.htmlUrl!)}>
          {tr('Im Browser öffnen', 'Open in browser')}
        </Button>
      ) : null}
    </div>
  );
}

export function HostingCiRunDetails({
  run,
  capabilities,
  jobs,
  artifacts,
  log,
  logName,
  busy,
  actionBusy,
  error,
  onCancel,
  onRetry,
  onLog,
  onMoreLog,
  onMoreJobs,
  onMoreArtifacts,
  onDownload,
  onManualJob,
}: Props) {
  const { tr } = useI18n();
  const titleId = useId();
  const active = isHostingRunActive(run);
  return (
    <article className="hosting-ci-detail" aria-labelledby={titleId}>
      <header className="hosting-ci-detail__header">
        <div className="hosting-ci-detail__identity">
          <h3 id={titleId}>
            <HostingCiStatusIcon state={run.conclusion ?? run.status} />
            {run.name}
            <span>#{run.number ?? run.id}</span>
          </h3>
          <HostingCiRunMeta run={run} />
        </div>
        <div className="hosting-ci-detail__actions">
          <HostingStateBadge state={run.conclusion ?? run.status} />
          <Button size="xs" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(run.htmlUrl)}>
            {tr('Im Browser öffnen', 'Open in browser')}
          </Button>
          {capabilities.cancelRun && active && (
            <Button size="xs" variant="danger" icon={<Square size={12} />} disabled={actionBusy} onClick={onCancel}>
              {tr('Abbrechen', 'Cancel')}
            </Button>
          )}
          {capabilities.retryRun && !active && (
            <Button size="xs" icon={<RotateCw size={13} />} disabled={actionBusy} onClick={onRetry}>
              {tr('Wiederholen', 'Retry')}
            </Button>
          )}
        </div>
      </header>
      <section className="hosting-ci-section">
        <h4>
          <Layers size={14} aria-hidden="true" />
          {capabilities.jobs ? 'Jobs' : 'Steps'}
          {jobs.items.length > 0 && <span>{jobs.items.length}</span>}
        </h4>
        {jobs.items.map((job) => (
          <CiJob key={job.id} job={job} capabilities={capabilities} busy={busy} actionBusy={actionBusy} onLog={onLog} onManualJob={onManualJob} />
        ))}
        {!jobs.items.length && !busy && !error && (
          <p className="hosting-ci-help">
            {capabilities.jobs || capabilities.steps
              ? tr('Keine Jobs oder Steps für diesen Lauf vorhanden.', 'No jobs or steps for this run.')
              : tr('Diese Server-API bietet keine Jobdetails an.', 'This server API does not provide job details.')}
          </p>
        )}
        {jobs.nextCursor && (
          <Button size="xs" disabled={busy} onClick={onMoreJobs}>
            {tr('Weitere Jobs laden', 'Load more jobs')}
          </Button>
        )}
      </section>
      {(capabilities.runLogs || !capabilities.logs) && (
        <div className="hosting-ci-log-actions">
          {capabilities.runLogs && (
            <Button size="xs" icon={<FileText size={13} />} disabled={busy} onClick={() => onLog()}>
              {tr('Lauf-Logs laden', 'Load run logs')}
            </Button>
          )}
          {!capabilities.logs && !capabilities.runLogs && (
            <p className="hosting-ci-help">
              {tr('Diese Server-API bietet keine Logs an. Logs im Browser öffnen.', 'This server API does not provide logs. Open logs in the browser.')}
            </p>
          )}
        </div>
      )}
      {log && <CiLog log={log} name={logName} url={run.htmlUrl} busy={busy} onMore={onMoreLog} />}
      <section className="hosting-ci-section hosting-ci-artifacts">
        <h4>
          <Box size={14} aria-hidden="true" />
          {tr('Artefakte', 'Artifacts')}
          {artifacts.items.length > 0 && <span>{artifacts.items.length}</span>}
        </h4>
        {artifacts.items.map((artifact) => (
          <CiArtifact key={artifact.id} artifact={artifact} busy={busy} onDownload={onDownload} />
        ))}
        {!artifacts.items.length && capabilities.artifacts && !busy && !error && (
          <p className="hosting-ci-help">{tr('Keine Artefakte für diesen Lauf vorhanden.', 'No artifacts for this run.')}</p>
        )}
        {!capabilities.artifacts && (
          <div className="hosting-ci-unavailable">
            <p className="hosting-ci-help">{tr('Artefakte sind über diese API nicht verfügbar.', 'Artifacts are unavailable through this API.')}</p>
            <Button size="xs" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(run.htmlUrl)}>
              {tr('Im Browser öffnen', 'Open in browser')}
            </Button>
          </div>
        )}
        {artifacts.nextCursor && (
          <Button size="xs" disabled={busy} onClick={onMoreArtifacts}>
            {tr('Weitere Artefakte laden', 'Load more artifacts')}
          </Button>
        )}
      </section>
      {busy && (
        <p className="hosting-ci-loading" role="status">
          <Loader2 size={15} className="spin" aria-hidden="true" />
          {tr('Lauf wird aktualisiert …', 'Updating run …')}
        </p>
      )}
      {error && (
        <p className="hosting-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function CiLog({ log, name, url, busy, onMore }: { log: HostingLog; name: string; url: string; busy: boolean; onMore: () => void }) {
  const { tr } = useI18n();
  return (
    <section className="hosting-ci-log" aria-label={tr('Lauf-Logs', 'Run logs')}>
      <header>
        <FileText size={14} aria-hidden="true" />
        <h4>Logs</h4>
        <span>{name}</span>
        <Button size="xs" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(url)}>
          {tr('Im Browser öffnen', 'Open in browser')}
        </Button>
      </header>
      <pre className="hosting-log" tabIndex={0}>
        {log.text || tr('Das Log enthält noch keine Ausgabe.', 'The log has no output yet.')}
      </pre>
      {(log.truncated || log.nextCursor) && (
        <footer>
          {log.truncated && (
            <span>{tr('Log gekürzt. Weitere Teile nachladen oder im Browser öffnen.', 'Log truncated. Load more or open it in the browser.')}</span>
          )}
          {log.nextCursor && (
            <Button size="xs" disabled={busy} onClick={onMore}>
              {tr('Weitere Logs laden', 'Load more logs')}
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}

function CiJob({
  job,
  capabilities,
  busy,
  actionBusy,
  onLog,
  onManualJob,
}: { job: HostingJob } & Pick<Props, 'capabilities' | 'busy' | 'actionBusy' | 'onLog' | 'onManualJob'>) {
  const { tr } = useI18n();
  return (
    <div className="hosting-job">
      <div className="hosting-job__header">
        <HostingCiStatusIcon state={job.conclusion ?? job.status} />
        <strong>{job.name}</strong>
        <HostingStateBadge state={job.conclusion ?? job.status} />
        <div className="hosting-job__actions">
          {capabilities.logs && (
            <Button icon={<FileText size={13} />} size="xs" disabled={busy} onClick={() => onLog(job.id)}>
              Logs
            </Button>
          )}
          {job.htmlUrl && (
            <Button size="xs" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(job.htmlUrl)}>
              {tr('Öffnen', 'Open')}
            </Button>
          )}
          {job.status === 'manual' && capabilities.dispatch && (
            <Button size="xs" icon={<Play size={13} />} disabled={actionBusy} onClick={() => onManualJob(job.id)}>
              {tr('Manuellen Job starten', 'Start manual job')}
            </Button>
          )}
        </div>
      </div>
      {job.steps.length > 0 && (
        <details className="hosting-job__steps">
          <summary>
            <ChevronRight size={13} className="hosting-job__chevron" aria-hidden="true" />
            {tr('Schritte', 'Steps')}
            <span>{job.steps.length}</span>
          </summary>
          <ol>
            {job.steps.map((step) => (
              <li key={step.id}>
                <HostingCiStatusIcon state={step.conclusion ?? step.status} />
                <span>{step.name}</span>
                <HostingStateBadge state={step.conclusion ?? step.status} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
