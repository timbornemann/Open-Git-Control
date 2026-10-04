import { useWorkflowStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
const operations = new Set(['git:executePush', 'git:retryPush', 'git:fetch', 'git:pull', 'git:planPush']);
export function RemoteTransferProgress({ repoPath }: { repoPath: string }) {
  const { tr } = useI18n();
  const jobs = useWorkflowStore((s) => s.jobs);
  const latest = jobs.find((job) => operations.has(job.operation) && job.details?.repoPath === repoPath);
  const events = latest
    ? jobs
        .filter((job) => job.id === latest.id && job.message)
        .slice(0, 15)
        .reverse()
    : [];
  if (!events.length) return null;
  return (
    <div className="hosting-card" aria-live="polite">
      <strong>{tr('Fortschritt je Ziel', 'Progress by target')}</strong>
      {events.map((event, index) => (
        <small key={`${event.id}-${event.timestamp}-${index}`}>{event.message}</small>
      ))}
    </div>
  );
}
