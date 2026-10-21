import { useState } from 'react';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { plannerClient } from '@/services/plannerClient';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerWorkDetails } from '@/types/plannerWork';
import { PlannerWorkHistory } from './PlannerWorkHistory';

export function PlannerWorkArchive({
  item,
  repoPath,
  activeId,
  onOpen,
}: {
  item: PlannerItem;
  repoPath: string;
  activeId?: string;
  onOpen(sha: string): void;
}) {
  const { tr } = useI18n();
  const [history, setHistory] = useState<Record<string, PlannerWorkDetails>>({});
  const [error, setError] = useState('');
  const branches = item.references?.branches.filter((entry) => entry.id !== activeId) || [];
  if (!branches.length) return null;
  return (
    <details>
      <summary>{tr('Frühere Zuordnungen', 'Previous assignments')}</summary>
      {error && <p role="status">{error}</p>}
      {branches.map((branch) => (
        <details
          key={branch.id}
          onToggle={(event) => {
            if (!event.currentTarget.open || history[branch.id]) return;
            void plannerClient
              .getWork({ repoPath, itemId: item.id, workflowId: branch.id })
              .then((result) => {
                if (result.success) setHistory((previous) => ({ ...previous, [branch.id]: result.data }));
                else setError(result.error);
              })
              .catch((e: unknown) => setError(String(e)));
          }}
        >
          <summary>
            <code>{branch.name}</code> · <code>{branch.baseSha.slice(0, 10)}</code>
          </summary>
          <PlannerWorkHistory details={history[branch.id]} onOpen={onOpen} />
          <ul>
            {item.references?.pullRequests
              .filter((entry) => entry.workflowId === branch.id)
              .map((reference) => (
                <li key={reference.url}>
                  <button type="button" onClick={() => void appClient.openExternalUrl(reference.url)}>
                    #{reference.number} {reference.fullPath}
                  </button>
                </li>
              ))}
          </ul>
        </details>
      ))}
    </details>
  );
}
