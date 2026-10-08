import { create } from 'zustand';
import { appClient } from '@/services/appClient';
import { getElectronApi } from '@/services/electronApi';
import { isSystemToolAvailable, updateSystemToolsAvailability } from '@/services/systemToolsAvailability';
import type { SystemToolId, SystemToolInstallEvent, SystemToolsStatus } from '@/shared/ipc/systemTools';

type ToolStore = {
  status: SystemToolsStatus | null;
  checking: boolean;
  dialogOpen: boolean;
  selectedTool: SystemToolId;
  reviewTool: SystemToolId | null;
  startupShown: boolean;
  error: string | null;
};
export const useSystemTools = create<ToolStore>(() => ({
  status: null,
  checking: false,
  dialogOpen: false,
  selectedTool: 'git',
  reviewTool: null,
  startupShown: false,
  error: null,
}));
export function receiveSystemTools(status: SystemToolsStatus) {
  updateSystemToolsAvailability(status.tools);
  useSystemTools.setState({ status });
}
export const openSystemTools = (selectedTool: SystemToolId = 'git') => useSystemTools.setState({ dialogOpen: true, selectedTool });
export const closeSystemTools = () => useSystemTools.setState({ dialogOpen: false });
export const reviewSystemTool = (reviewTool: SystemToolId | null) => useSystemTools.setState({ reviewTool });
export function useGitAvailable() {
  useSystemTools((state) => state.status);
  return isSystemToolAvailable('git');
}
let pending: Promise<void> | undefined;
export function recheckSystemTools(): Promise<void> {
  if (pending) return pending;
  if (!getElectronApi()?.app?.recheckSystemTools) return Promise.resolve();
  useSystemTools.setState({ checking: true, error: null });
  pending = appClient
    .recheckSystemTools()
    .then(receiveSystemTools)
    .catch((error: unknown) => {
      useSystemTools.setState({ error: error instanceof Error ? error.message : String(error) });
    })
    .finally(() => {
      pending = undefined;
      useSystemTools.setState({ checking: false });
    });
  return pending;
}
export async function installSystemTool(toolId: SystemToolId, acceptAgreements = false): Promise<void> {
  reviewSystemTool(null);
  useSystemTools.setState({ error: null });
  try {
    const result = await appClient.installSystemTool({ toolId, ...(acceptAgreements ? { acceptAgreements } : {}) });
    if (!result.success) throw new Error(result.error);
    receiveToolInstallation(result.data);
  } catch (error) {
    useSystemTools.setState({ error: error instanceof Error ? error.message : String(error) });
  }
}
export function receiveToolInstallation(event: SystemToolInstallEvent) {
  const status = useSystemTools.getState().status;
  if (status) useSystemTools.setState({ status: { ...status, installation: event } });
}
export const toolInstallationRunning = (event?: SystemToolInstallEvent | null) =>
  Boolean(event && ['preparing', 'installing', 'verifying'].includes(event.phase));

/** A single subscription serves bootstrap, settings, the activity bar and dialogs. */
export function startSystemToolsRuntime(): () => void {
  const api = getElectronApi()?.app;
  if (!api?.getSystemToolsStatus) return () => {};
  let active = true;
  let received = 0;
  const stopStatus = api.onSystemToolsStatus((status) => {
    received++;
    receiveSystemTools(status);
  });
  const stopInstall = api.onSystemToolInstallation(receiveToolInstallation);
  const generation = received;
  void api
    .getSystemToolsStatus()
    .then((status) => {
      if (active && received === generation) receiveSystemTools(status);
    })
    .catch((error: unknown) => {
      if (active) useSystemTools.setState({ error: error instanceof Error ? error.message : String(error) });
    });
  const onOpen = (event: Event) => openSystemTools((event as CustomEvent<SystemToolId>).detail || 'git');
  const onFocus = () => {
    if (document.visibilityState !== 'hidden') void recheckSystemTools();
  };
  const timer = window.setInterval(() => {
    if (document.visibilityState !== 'hidden' && !isSystemToolAvailable('git')) void recheckSystemTools();
  }, 30000);
  window.addEventListener('system-tools:open', onOpen);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  return () => {
    active = false;
    stopStatus();
    stopInstall();
    window.clearInterval(timer);
    window.removeEventListener('system-tools:open', onOpen);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
  };
}
