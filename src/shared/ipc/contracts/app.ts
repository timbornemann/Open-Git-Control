import type { DiagnosticsReportDto, PlanningApiInfoDto, PlanningApiTokenLifetimeDto, UpdaterOneClickResultDto, UpdaterStatusDto } from '../../../types/appDtos';
import type { IpcResult } from '../../../types/ipc';

export type DirectoryOpenResultDto = {
  path: string;
  isRepo: boolean;
};

export type BasicActionResultDto = {
  success: boolean;
  error?: string;
};

export interface ElectronAppAPI {
  openDirectory: () => Promise<DirectoryOpenResultDto | null>;
  selectDirectory: () => Promise<string | null>;
  selectProjectParentDirectory: () => Promise<string | null>;
  openExternalUrl: (url: string) => Promise<BasicActionResultDto>;
  getPlanningApiInfo: () => Promise<PlanningApiInfoDto>;
  generatePlanningApiToken: (lifetime: PlanningApiTokenLifetimeDto) => Promise<PlanningApiInfoDto>;
  clearPlanningApiToken: () => Promise<PlanningApiInfoDto>;
  getAppVersion: () => Promise<string>;
  getUpdaterStatus: () => Promise<UpdaterStatusDto>;
  checkForAppUpdates: () => Promise<BasicActionResultDto>;
  runOneClickAppUpdate: () => Promise<UpdaterOneClickResultDto>;
  downloadAppUpdate: () => Promise<BasicActionResultDto>;
  installAppUpdate: () => Promise<BasicActionResultDto>;
  onUpdaterEvent: (callback: (event: UpdaterStatusDto) => void) => () => void;
  getDiagnosticsReport: () => Promise<IpcResult<DiagnosticsReportDto>>;
}
