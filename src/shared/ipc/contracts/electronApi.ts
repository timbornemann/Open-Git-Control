import type { ElectronAiAPI, ElectronReleaseNotesAPI } from './ai';
import type { ElectronAppAPI } from './app';
import type { ElectronGitAPI } from './git';
import type { ElectronPlannerAPI } from './planner';
import type { ElectronReposAPI } from './repos';
import type { ElectronRepositoryRunAPI } from './repositoryRun';
import type { ElectronSettingsAPI } from './settings';
import type { ElectronHostingAPI } from './hosting';
import type { ElectronRemoteTransferAPI } from './remoteTransfers';

export type ElectronApiNamespaceKey = 'git' | 'hosting' | 'transfers' | 'planner' | 'settings' | 'app' | 'ai' | 'repos' | 'runs';

export interface ElectronFlatAPI
  extends
    ElectronGitAPI,
    ElectronHostingAPI,
    ElectronRemoteTransferAPI,
    ElectronReleaseNotesAPI,
    ElectronPlannerAPI,
    ElectronSettingsAPI,
    ElectronAppAPI,
    ElectronAiAPI,
    ElectronReposAPI,
    ElectronRepositoryRunAPI {}

export interface ElectronAPI extends ElectronFlatAPI {
  git: ElectronGitAPI;
  hosting: ElectronHostingAPI;
  transfers: ElectronRemoteTransferAPI;
  planner: ElectronPlannerAPI;
  settings: ElectronSettingsAPI;
  app: ElectronAppAPI;
  ai: ElectronAiAPI;
  repos: ElectronReposAPI;
  runs: ElectronRepositoryRunAPI;
}

export type { ElectronAiAPI, ElectronReleaseNotesAPI } from './ai';
export type { ElectronAppAPI } from './app';
export type { ElectronGitAPI } from './git';
export type { ElectronPlannerAPI } from './planner';
export type { ElectronReposAPI } from './repos';
export type { ElectronRepositoryRunAPI } from './repositoryRun';
export type { ElectronSettingsAPI } from './settings';
