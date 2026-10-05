import { StatusBadge } from '@/components/ui/StatusBadge';
import { useI18n } from '@/i18n';

const stateLabels: Record<string, [string, string]> = {
  success: ['Erfolgreich', 'Success'],
  successful: ['Erfolgreich', 'Success'],
  passed: ['Erfolgreich', 'Passed'],
  completed: ['Abgeschlossen', 'Completed'],
  failed: ['Fehlgeschlagen', 'Failed'],
  failure: ['Fehlgeschlagen', 'Failed'],
  error: ['Fehler', 'Error'],
  cancelled: ['Abgebrochen', 'Cancelled'],
  canceled: ['Abgebrochen', 'Cancelled'],
  declined: ['Abgelehnt', 'Declined'],
  running: ['Läuft', 'Running'],
  in_progress: ['Läuft', 'In progress'],
  pending: ['Ausstehend', 'Pending'],
  queued: ['In Warteschlange', 'Queued'],
  waiting: ['Wartet', 'Waiting'],
  manual: ['Manuell', 'Manual'],
  merged: ['Zusammengeführt', 'Merged'],
  open: ['Offen', 'Open'],
  closed: ['Geschlossen', 'Closed'],
};

export function HostingStateBadge({ state }: { state: string }) {
  const { tr } = useI18n();
  const normalized = state.toLowerCase();
  const tone = ['success', 'successful', 'passed'].includes(normalized)
    ? 'success'
    : ['failed', 'failure', 'error', 'cancelled', 'canceled', 'declined'].includes(normalized)
      ? 'danger'
      : ['running', 'in_progress', 'pending', 'queued', 'waiting', 'manual'].includes(normalized)
        ? 'warning'
        : normalized === 'merged'
          ? 'merged'
          : normalized === 'open'
            ? 'info'
            : 'neutral';
  const label = stateLabels[normalized];
  return <StatusBadge tone={tone}>{label ? tr(...label) : state}</StatusBadge>;
}
