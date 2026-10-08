import type { SystemToolId, SystemToolState } from '@/shared/ipc/systemTools';

let states = new Map<SystemToolId, SystemToolState>();
export function updateSystemToolsAvailability(tools: { id: SystemToolId; state: SystemToolState }[]) {
  states = new Map(tools.map((tool) => [tool.id, tool.state]));
}
export function isSystemToolAvailable(id: SystemToolId): boolean {
  // Older bridges and component fixtures do not expose system tool management.
  if (typeof window === 'undefined' || !window.electronAPI?.app?.getSystemToolsStatus) return true;
  return states.get(id) === 'available';
}
export function requestSystemTools(id: SystemToolId = 'git') {
  window.dispatchEvent(new CustomEvent('system-tools:open', { detail: id }));
}
