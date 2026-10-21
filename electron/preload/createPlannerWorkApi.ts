import { IpcChannel } from '../../src/types/ipcContract';
import type { ElectronPlannerAPI } from '../../src/shared/ipc/contracts/planner';
type Invoke = { invoke(channel: string, ...args: unknown[]): Promise<any> };
export const createPlannerWorkApi = (
  ipc: Invoke,
): Pick<ElectronPlannerAPI, 'plannerInspectWork' | 'plannerStartWork' | 'plannerGetWork' | 'plannerRefreshWork' | 'plannerUpdateWork'> => ({
  plannerInspectWork: (request) => ipc.invoke(IpcChannel.PlannerInspectWork, request),
  plannerStartWork: (request) => ipc.invoke(IpcChannel.PlannerStartWork, request),
  plannerGetWork: (request) => ipc.invoke(IpcChannel.PlannerGetWork, request),
  plannerRefreshWork: (request) => ipc.invoke(IpcChannel.PlannerRefreshWork, request),
  plannerUpdateWork: (request) => ipc.invoke(IpcChannel.PlannerUpdateWork, request),
});
