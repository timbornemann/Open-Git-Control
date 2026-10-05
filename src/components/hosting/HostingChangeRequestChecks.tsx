import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import type { HostingChangeRequest, HostingStatus } from '@/types/hostingDtos';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import { useHostingTask } from './useHostingTask';

export function HostingChangeRequestChecks({ change }: { change: HostingChangeRequest }) {
  const { tr } = useI18n();
  const task = useHostingTask(`${change.source.connectionId}/${change.source.repositoryId}/${change.headSha}`);
  const [status, setStatus] = useState<HostingStatus | null>(null);
  return (
    <div>
      <Button
        disabled={task.busy}
        onClick={() => void task.run(() => hostingClient.request('status', { repository: change.source, ref: change.headSha }), setStatus)}
      >
        {tr('CI am PR/MR-Stand prüfen', 'Check CI at the change request revision')}
      </Button>
      {status && (
        <>
          <p>CI: {status.state}</p>
          {status.checks.map((check) => (
            <p key={check.id}>
              {check.name}: {check.status}{' '}
              {check.htmlUrl && <Button onClick={() => void appClient.openExternalUrl(check.htmlUrl!)}>{tr('Öffnen', 'Open')}</Button>}
            </p>
          ))}
        </>
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
