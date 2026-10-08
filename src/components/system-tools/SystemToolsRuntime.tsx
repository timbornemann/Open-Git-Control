import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import { useNotifications } from '@/contexts/NotificationContext';
import { openSystemTools, startSystemToolsRuntime, toolInstallationRunning, useSystemTools } from '@/app/state/systemToolsStore';
import { SystemToolsDialog } from './SystemToolsDialog';
import { toolName, toolPhaseLabel } from './toolLabels';
import type { NotificationMessage } from '@/types/notifications';

export function SystemToolsRuntime() {
  const { tr } = useI18n();
  const notifications = useNotifications();
  const state = useSystemTools();
  const notice = useRef<{ operation: string; id: number } | null>(null);
  const previousEvent = useRef('');
  const previousError = useRef<string | null>(null);
  useEffect(startSystemToolsRuntime, []);
  const gitState = state.status?.tools.find((tool) => tool.id === 'git')?.state;
  useEffect(() => {
    if (!state.startupShown && (gitState === 'missing' || gitState === 'unusable')) {
      useSystemTools.setState({ startupShown: true });
      openSystemTools();
    }
  }, [gitState, state.startupShown]);
  const event = state.status?.installation;
  useEffect(() => {
    if (!event) return;
    const key = `${event.operationId}:${event.phase}`;
    if (previousEvent.current === key) return;
    previousEvent.current = key;
    const running = toolInstallationRunning(event);
    const message: NotificationMessage = {
      title: `${toolName(event.toolId)} · ${tr('Installation', 'Installation')}`,
      msg: running
        ? toolPhaseLabel(event.phase, tr)
        : event.phase === 'done'
          ? tr('Installiert und erfolgreich geprüft.', 'Installed and verified.')
          : event.phase === 'cancelled'
            ? tr('Installation abgebrochen.', 'Installation cancelled.')
            : event.phase === 'agreements-required'
              ? tr('Paketvereinbarungen müssen bestätigt werden.', 'Package agreements require confirmation.')
              : tr('Installation fehlgeschlagen.', 'Installation failed.'),
      isError: event.phase === 'failed',
      kind: running ? 'progress' : event.phase === 'done' ? 'success' : event.phase === 'failed' ? 'error' : 'info',
      detail: event.detail,
      autoHideMs: running ? null : event.phase === 'failed' ? 12000 : 6000,
      dismissible: !running,
      ...(running ? { progress: { value: null, label: toolPhaseLabel(event.phase, tr) } } : {}),
      actions: [{ label: tr('Werkzeuge öffnen', 'Open system tools'), onClick: () => openSystemTools(event.toolId) }],
    };
    if (notice.current?.operation === event.operationId && notifications.update(notice.current.id, message)) return;
    notice.current = { operation: event.operationId, id: notifications.publish(message) };
  }, [event, notifications, tr]);
  useEffect(() => {
    if (state.error && state.error !== previousError.current)
      notifications.publish({ msg: state.error, isError: true, title: tr('Werkzeuge', 'System tools') });
    previousError.current = state.error;
  }, [state.error, notifications, tr]);
  return <SystemToolsDialog />;
}
