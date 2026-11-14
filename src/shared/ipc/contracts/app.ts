import type { AppBootstrapDto, PreviewSnapshot } from '../../cache/resource';
import type { DiagnosticsReportDto, PlanningApiInfoDto, PlanningApiTokenLifetimeDto, UpdaterOneClickResultDto, UpdaterStatusDto } from '../../../types/appDtos';
import type { IpcResult } from '../../../types/ipc';
import type { ElectronStorageAPI } from '../storageMaintenance';
import type {
  FeedbackReportCapabilityDto,
  FeedbackReportInputDto,
  FeedbackReportPreviewDto,
  FeedbackReportSubmissionResultDto,
} from '../../../types/feedbackDtos';
import type { InstallSystemToolRequest, SystemToolInstallEvent, SystemToolsStatus } from '../systemTools';
import type { ElectronUserNotesAPI } from './userNotes';
import type { JsonSchemaValidationRequest } from '../jsonSchemaValidation';
import type { TutorialControlApi } from '../../tutorial/types';

export type DirectoryOpenResultDto = {
  path: string;
  isRepo: boolean;
};

export type BasicActionResultDto = {
  success: boolean;
  error?: string;
};

export interface ElectronAppAPI extends ElectronStorageAPI, ElectronUserNotesAPI, TutorialControlApi {
  validateJsonSchema: (request: JsonSchemaValidationRequest) => Promise<IpcResult<string[]>>;
  getSystemToolsStatus: () => Promise<SystemToolsStatus>;
  recheckSystemTools: () => Promise<SystemToolsStatus>;
  installSystemTool: (request: InstallSystemToolRequest) => Promise<IpcResult<SystemToolInstallEvent>>;
  onSystemToolsStatus: (callback: (status: SystemToolsStatus) => void) => () => void;
  onSystemToolInstallation: (callback: (event: SystemToolInstallEvent) => void) => () => void;
  cancelReadRequest: (requestId: string) => Promise<void>;
  getBootstrap: () => Promise<AppBootstrapDto>;
  savePreviews: (snapshots: PreviewSnapshot[]) => Promise<void>;
  openDirectory: () => Promise<DirectoryOpenResultDto | null>;
  selectDirectory: () => Promise<string | null>;
  selectFiles: () => Promise<string[] | null>;
  selectProjectParentDirectory: () => Promise<string | null>;
  openExternalUrl: (url: string) => Promise<BasicActionResultDto>;
  getFeedbackReportCapability: () => Promise<FeedbackReportCapabilityDto>;
  previewFeedbackReport: (input: FeedbackReportInputDto, delivery?: 'browser') => Promise<IpcResult<FeedbackReportPreviewDto>>;
  submitFeedbackReport: (input: FeedbackReportInputDto) => Promise<FeedbackReportSubmissionResultDto>;
  getPlanningApiInfo: () => Promise<PlanningApiInfoDto>;
  generatePlanningApiToken: (lifetime: PlanningApiTokenLifetimeDto) => Promise<PlanningApiInfoDto>;
  clearPlanningApiToken: () => Promise<PlanningApiInfoDto>;
  getAppVersion: () => Promise<string>;
  getUpdaterStatus: () => Promise<UpdaterStatusDto>;
  checkForAppUpdates: () => Promise<BasicActionResultDto>;
  runOneClickAppUpdate: () => Promise<UpdaterOneClickResultDto>;
  downloadAppUpdate: () => Promise<BasicActionResultDto>;
  installAppUpdate: () => Promise<BasicActionResultDto>;
  openRecoveryUpdater: () => Promise<BasicActionResultDto>;
  onUpdaterEvent: (callback: (event: UpdaterStatusDto) => void) => () => void;
  getDiagnosticsReport: () => Promise<IpcResult<DiagnosticsReportDto>>;
  writeClipboardText: (text: string) => Promise<BasicActionResultDto>;
}
