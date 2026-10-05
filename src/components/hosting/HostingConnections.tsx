import { useCallback, useEffect, useState } from 'react';
import { LogOut, Pencil, Plus, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { hostingClient } from '@/services/hostingClient';
import { useI18n } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';
import { providerLabels, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingConnectionEditor } from './HostingConnectionEditor';

export function HostingConnections() {
  const { tr } = useI18n();
  const { connections, setConnections, refresh } = useHostingState();
  const [editor, setEditor] = useState<{ connection: HostingConnection | null } | null>(null);
  const task = useHostingTask('connections');
  const { run } = task;
  const reload = useCallback(() => hostingClient.request('connections', undefined), []);
  const updated = (values: HostingConnection[]) => {
    setConnections(values);
    refresh();
  };
  useEffect(() => {
    void run(reload, setConnections);
  }, [run, reload, setConnections]);
  return (
    <section className="hosting-connections">
      <div className="hosting-section-heading">
        <div>
          <h2>{tr('Verbundene Konten', 'Connected accounts')}</h2>
          <p className="hosting-help">
            {tr('Jedes Konto behält seine eigenen Repositories und Zugangsdaten.', 'Each account keeps its own repositories and credentials.')}
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} disabled={task.busy} onClick={() => setEditor({ connection: null })}>
          {tr('Verbindung hinzufügen', 'Add connection')}
        </Button>
      </div>
      <div className="hosting-card-grid">
        {connections.map((connection) => (
          <article className="hosting-card hosting-account" key={connection.id}>
            <header className="hosting-account__header">
              <span className="hosting-signet" aria-hidden="true">
                <Server size={18} />
              </span>
              <div>
                <h3>{connection.label}</h3>
                <span>{providerLabels[connection.provider]}</span>
              </div>
              <StatusBadge tone={connection.authenticated ? 'success' : 'warning'}>
                {connection.authenticated ? tr('Verbunden', 'Connected') : tr('Anmeldung erforderlich', 'Sign-in required')}
              </StatusBadge>
            </header>
            <dl className="hosting-properties">
              <div>
                <dt>{tr('Server', 'Server')}</dt>
                <dd>{connection.baseUrl}</dd>
              </div>
              <div>
                <dt>{tr('Konto', 'Account')}</dt>
                <dd>{connection.username ?? tr('Nicht angemeldet', 'Signed out')}</dd>
              </div>
            </dl>
            {connection.hasCredentials && connection.tokenPersisted === false && (
              <p className="hosting-help">{tr('Zugangsdaten nur für diese Sitzung gespeichert.', 'Credentials stored for this session only.')}</p>
            )}
            <div className="hosting-account__actions">
              {connection.hasCredentials && !connection.authenticated && (
                <Button
                  icon={<ShieldCheck size={13} />}
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(async () => {
                      await hostingClient.request('capabilities', { connectionId: connection.id });
                      return reload();
                    }, updated)
                  }
                >
                  {tr('Verbindung prüfen', 'Verify connection')}
                </Button>
              )}
              <Button icon={<Pencil size={13} />} disabled={task.busy} onClick={() => setEditor({ connection })}>
                {tr('Bearbeiten', 'Edit')}
              </Button>
              {connection.hasCredentials && (
                <Button
                  variant="ghost"
                  icon={<LogOut size={13} />}
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(async () => {
                      await hostingClient.request('logout', { connectionId: connection.id });
                      return reload();
                    }, updated)
                  }
                >
                  {tr('Abmelden', 'Sign out')}
                </Button>
              )}
              <Button
                variant="ghost"
                className="hosting-account__remove"
                icon={<Trash2 size={13} />}
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await hostingClient.request('removeConnection', { connectionId: connection.id });
                    return reload();
                  }, updated)
                }
              >
                {tr('Entfernen', 'Remove')}
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!connections.length && !task.busy && (
        <div className="hosting-empty">
          <Server size={30} aria-hidden="true" />
          <h3>{tr('Noch keine Verbindung', 'No connections yet')}</h3>
          <p>{tr('Füge ein Konto hinzu, um deine Repositories zu sehen.', 'Add an account to see your repositories.')}</p>
        </div>
      )}
      {task.busy && (
        <p className="hosting-notice" role="status">
          {tr('Verbindungen werden geladen …', 'Loading connections …')}
        </p>
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
      {editor && <HostingConnectionEditor connection={editor.connection} onClose={() => setEditor(null)} />}
    </section>
  );
}
