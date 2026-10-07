import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  PlayCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import { formatDateTime } from '@/utils/dateTime';
import type { HostingRun, HostingStatus } from '@/types/hostingDtos';
import { HostingStateBadge } from './HostingStateBadge';

export const isHostingRunActive = (run: HostingRun) =>
  !run.conclusion && !['completed', 'success', 'failed', 'failure', 'error', 'cancelled', 'canceled', 'stopped'].includes(run.status.toLowerCase());

export function HostingCiStatusIcon({ state }: { state: string }) {
  const normalized = state.toLowerCase();
  const [Icon, tone]: [LucideIcon, string] = ['success', 'successful', 'passed'].includes(normalized)
    ? [CheckCircle2, 'success']
    : ['failed', 'failure', 'error'].includes(normalized)
      ? [XCircle, 'danger']
      : ['cancelled', 'canceled', 'stopped'].includes(normalized)
        ? [Ban, 'neutral']
        : ['running', 'in_progress'].includes(normalized)
          ? [Loader2, 'running']
          : normalized === 'manual'
            ? [PlayCircle, 'warning']
            : ['queued', 'pending', 'waiting'].includes(normalized)
              ? [Clock3, 'warning']
              : [Circle, 'neutral'];
  return (
    <span className={`hosting-ci-state-icon hosting-ci-state-icon--${tone}`} aria-hidden="true">
      <Icon size={16} className={tone === 'running' ? 'spin' : undefined} />
    </span>
  );
}

export function HostingCiRunMeta({ run }: { run: HostingRun }) {
  const { tr, locale } = useI18n();
  return (
    <span className="hosting-ci-meta">
      {run.branch && (
        <span title={tr('Branch', 'Branch')}>
          <GitBranch size={12} aria-hidden="true" />
          {run.branch}
        </span>
      )}
      {run.headSha && (
        <span title={run.headSha}>
          <GitCommitHorizontal size={13} aria-hidden="true" />
          <code>{run.headSha.slice(0, 8)}</code>
        </span>
      )}
      {run.event && <span>{run.event}</span>}
      {run.createdAt && Number.isFinite(new Date(run.createdAt).getTime()) && (
        <time dateTime={run.createdAt}>
          <Clock3 size={12} aria-hidden="true" />
          {formatDateTime(run.createdAt, locale, { dateStyle: 'short', timeStyle: 'short' })}
        </time>
      )}
    </span>
  );
}

export function HostingCiRunList({ runs, selected, onSelect }: { runs: HostingRun[]; selected?: string; onSelect: (run: HostingRun) => void }) {
  const { tr } = useI18n();
  return (
    <div className="hosting-ci-runs" role="list" aria-label={tr('Lauf-Verlauf', 'Run history')}>
      {runs.map((run) => (
        <div role="listitem" key={run.id}>
          <Button className="hosting-run" variant="ghost" aria-pressed={selected === run.id} onClick={() => onSelect(run)}>
            <HostingCiStatusIcon state={run.conclusion ?? run.status} />
            <span className="hosting-run__identity">
              <span className="hosting-run__title">
                <strong>{run.name}</strong>
                <span>#{run.number ?? run.id}</span>
              </span>
              <HostingCiRunMeta run={run} />
            </span>
            <HostingStateBadge state={run.conclusion ?? run.status} />
            <ChevronRight size={14} className="hosting-run__chevron" aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function HostingCiBuildStatus({ status, busy, error }: { status: HostingStatus | null; busy: boolean; error: string | null }) {
  const { tr } = useI18n();
  return (
    <section className="hosting-ci-builds">
      <p className="hosting-ci-help">
        {tr(
          'Externe Buildstatus. Die Bedienung des CI-Systems erfolgt über dessen Buildlink.',
          'External build statuses. Control your CI system through its build link.',
        )}
      </p>
      {status?.checks.map((check) => (
        <div className="hosting-ci-check" key={check.id}>
          <HostingCiStatusIcon state={check.status} />
          <div className="hosting-ci-check__identity">
            <strong>{check.name}</strong>
            {check.description && <p>{check.description}</p>}
          </div>
          <HostingStateBadge state={check.status} />
          {check.htmlUrl && (
            <Button size="xs" icon={<ExternalLink size={13} />} onClick={() => void appClient.openExternalUrl(check.htmlUrl!)}>
              {tr('Build öffnen', 'Open build')}
            </Button>
          )}
        </div>
      ))}
      {status && !status.checks.length && !busy && !error && (
        <p className="hosting-ci-help">{tr('Keine Buildstatus für diesen Ref vorhanden.', 'No build statuses for this ref.')}</p>
      )}
    </section>
  );
}
