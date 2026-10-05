import { useState } from 'react';
import { GitFork } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { hostingClient } from '@/services/hostingClient';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingCapabilities } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingDialog } from './HostingDialog';

export function HostingForkDialog({
  repository,
  capabilities,
  open,
  onClose,
}: {
  repository: HostedRepository;
  capabilities: HostingCapabilities;
  open: boolean;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const [namespace, setNamespace] = useState('');
  const [name, setName] = useState('');
  const [defaultBranchOnly, setDefaultBranchOnly] = useState(false);
  const task = useHostingTask(hostedRepositoryKey(repository));
  const state = useHostingState();
  return (
    <HostingDialog
      open={open}
      title={tr('Repository forken', 'Fork repository')}
      onClose={() => {
        if (!task.busy) onClose();
      }}
    >
      <form
        className="hosting-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!task.busy)
            void task.run(
              () =>
                hostingClient.request('fork', { repository: repository.ref, namespace: namespace || undefined, name: name || undefined, defaultBranchOnly }),
              (fork) => {
                state.refresh();
                state.select(fork);
                onClose();
              },
            );
        }}
      >
        <p className="hosting-help">{repository.fullName}</p>
        <label>
          {tr('Zielnamespace', 'Destination namespace')}
          <TextField value={namespace} onChange={(event) => setNamespace(event.target.value)} />
        </label>
        <label>
          {tr('Optionaler Name', 'Optional name')}
          <TextField value={name} onChange={(event) => setName(event.target.value)} placeholder={repository.name} />
        </label>
        {capabilities.defaultBranchOnlyFork && (
          <label className="hosting-checkbox">
            <input type="checkbox" checked={defaultBranchOnly} onChange={(event) => setDefaultBranchOnly(event.target.checked)} />
            {tr('Nur Standardbranch', 'Default branch only')}
          </label>
        )}
        <Button type="submit" variant="primary" icon={<GitFork size={14} />} disabled={task.busy}>
          {tr('Fork erstellen', 'Create fork')}
        </Button>
        {task.error && (
          <p className="hosting-error" role="alert">
            {task.error}
          </p>
        )}
      </form>
    </HostingDialog>
  );
}
