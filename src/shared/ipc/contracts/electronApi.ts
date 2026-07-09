import type { ElectronAiAPI } from './ai';
import type { ElectronAppAPI } from './app';
import type { ElectronGitAPI } from './git';
import type { ElectronGithubAPI, ElectronReleaseNotesAPI } from './github';
import type { ElectronPlannerAPI } from './planner';
import type { ElectronReposAPI } from './repos';
import type { ElectronSettingsAPI } from './settings';

export type ElectronApiNamespaceKey = 'git' | 'github' | 'planner' | 'settings' | 'app' | 'ai' | 'repos';

export interface ElectronFlatAPI
  extends
    ElectronGitAPI,
    ElectronGithubAPI,
    ElectronReleaseNotesAPI,
    ElectronPlannerAPI,
    ElectronSettingsAPI,
    ElectronAppAPI,
    ElectronAiAPI,
    ElectronReposAPI {}

export interface ElectronAPI extends ElectronFlatAPI {
  git: ElectronGitAPI;
  github: ElectronGithubAPI;
  planner: ElectronPlannerAPI;
  settings: ElectronSettingsAPI;
  app: ElectronAppAPI;
  ai: ElectronAiAPI;
  repos: ElectronReposAPI;
}

export type { ElectronAiAPI } from './ai';
export type { ElectronAppAPI } from './app';
export type { ElectronGitAPI } from './git';
export type { ElectronGithubAPI, ElectronReleaseNotesAPI } from './github';
export type { ElectronPlannerAPI } from './planner';
export type { ElectronReposAPI } from './repos';
export type { ElectronSettingsAPI } from './settings';
