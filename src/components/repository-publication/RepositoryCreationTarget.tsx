import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField as Input } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import { useAppToast } from '@/hooks/useAppToast';
import { hostingClient } from '@/services/hostingClient';
import type { HostingConnection, HostingRepositoryCreation } from '@/types/hostingDtos';
import type { HostingCreationTarget } from '@/types/repositoryPublication';
import './repository-publication.css';

type Props = { connection?: HostingConnection; creation: HostingRepositoryCreation; onChange: (value: HostingRepositoryCreation) => void; disabled?: boolean };
function useTargets(connectionId: string, parent: string | undefined, enabled: boolean) {
  const [items, setItems] = useState<HostingCreationTarget[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const lifecycle = useRef({ generation: 0 }).current,
    showToast = useAppToast();
  const load = async (next?: string) => {
    const id = lifecycle.generation;
    setBusy(true);
    try {
      const result = await hostingClient.request('creationTargets', { connectionId, parent, cursor: next });
      if (id === lifecycle.generation) {
        setItems((previous) => (next ? [...previous, ...result.items] : result.items));
        setCursor(result.nextCursor);
      }
    } catch (error) {
      if (id === lifecycle.generation) showToast(error instanceof Error ? error.message : String(error), true);
    } finally {
      if (id === lifecycle.generation) setBusy(false);
    }
  };
  useEffect(() => {
    lifecycle.generation++;
    setItems([]);
    setCursor(null);
    if (connectionId && enabled) void load();
    return () => {
      lifecycle.generation++;
    };
    // The loader is bound to this account and parent; pagination is an explicit action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, parent, enabled]);
  return { items, cursor, busy, more: () => void load(cursor || undefined) };
}

export function RepositoryCreationTarget({ connection, creation, onChange, disabled }: Props) {
  const { tr } = useI18n();
  const [manual, setManual] = useState(false);
  const targets = useTargets(connection?.id || '', undefined, Boolean(connection));
  const cloud = connection?.provider === 'bitbucket-cloud';
  const projects = useTargets(connection?.id || '', creation.namespace, Boolean(cloud && creation.namespace));
  const namespaceLabel = cloud
    ? 'Workspace'
    : connection?.provider === 'bitbucket-data-center'
      ? tr('Projekt', 'Project')
      : tr('Konto, Organisation oder Namespace', 'Account, organization or namespace');
  return (
    <div className="publication-target-fields">
      <label>
        {namespaceLabel}
        {manual ? (
          <Input
            value={creation.namespace || ''}
            disabled={disabled}
            placeholder={connection?.username || namespaceLabel}
            onChange={(event) => onChange({ ...creation, namespace: event.target.value, projectKey: undefined })}
          />
        ) : (
          <select
            aria-label={namespaceLabel}
            value={creation.namespace || ''}
            disabled={disabled || targets.busy}
            onChange={(event) => onChange({ ...creation, namespace: event.target.value, projectKey: undefined })}
          >
            <option value="">{targets.busy ? tr('Ziele werden geladen …', 'Loading targets …') : tr('Ziel auswählen', 'Choose target')}</option>
            {creation.namespace && !targets.items.some((t) => (connection?.provider === 'gitlab' ? t.id : t.namespace) === creation.namespace) && (
              <option value={creation.namespace}>{creation.namespace}</option>
            )}
            {targets.items.map((item) => (
              <option key={item.id} value={connection?.provider === 'gitlab' ? item.id : item.namespace}>
                {item.label}
              </option>
            ))}
          </select>
        )}
      </label>
      {cloud && (
        <label>
          {tr('Projekt (erforderlich)', 'Project (required)')}
          {manual ? (
            <Input value={creation.projectKey || ''} disabled={disabled} onChange={(event) => onChange({ ...creation, projectKey: event.target.value })} />
          ) : (
            <select
              aria-label={tr('Projekt', 'Project')}
              value={creation.projectKey || ''}
              disabled={disabled || projects.busy || !creation.namespace}
              onChange={(event) => onChange({ ...creation, projectKey: event.target.value })}
            >
              <option value="">{tr('Projekt ausdrücklich auswählen', 'Select a project explicitly')}</option>
              {creation.projectKey && !projects.items.some((p) => p.projectKey === creation.projectKey) && (
                <option value={creation.projectKey}>{creation.projectKey}</option>
              )}
              {projects.items.map((item) => (
                <option key={item.id} value={item.projectKey}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
      <div className="publication-target-actions">
        {targets.cursor && (
          <Button size="xs" disabled={disabled || targets.busy} onClick={targets.more}>
            {tr('Weitere Ziele', 'More targets')}
          </Button>
        )}
        {cloud && projects.cursor && (
          <Button size="xs" disabled={disabled || projects.busy} onClick={projects.more}>
            {tr('Weitere Projekte', 'More projects')}
          </Button>
        )}
        <Button size="xs" variant="ghost" disabled={disabled} onClick={() => setManual((value) => !value)}>
          {manual ? tr('Aus Liste wählen', 'Choose from list') : tr('Zielkennung eingeben', 'Enter target identifier')}
        </Button>
      </div>
      {manual && (
        <small>
          {tr(
            'Die Zielkennung und deine Berechtigung werden vor der Erstellung beim Anbieter geprüft.',
            'The provider will verify the target identifier and your permissions before creation.',
          )}
        </small>
      )}
    </div>
  );
}
