import type {
  GitHubCreateReleaseParamsDto,
  GitHubReleaseContextDto,
  GitHubReleaseDto,
  GitHubRepositoryDto,
  IpcResult,
  PullRequestMergeMethodDto,
  ReleaseCommitDto,
} from '../global';
import { getElectronApi, requireElectronApi } from './electronApi';

export const githubClient = {
  isAvailable(): boolean {
    return Boolean(getElectronApi());
  },

  async openExternalUrl(url: string): Promise<{ success: boolean; error?: string }> {
    return requireElectronApi().openExternalUrl(url);
  },

  async checkAuthStatus(): Promise<{ authenticated: boolean; username: string | null }> {
    return requireElectronApi().githubCheckAuthStatus();
  },

  async createRepository(
    name: string,
    description: string,
    isPrivate: boolean,
  ): Promise<IpcResult<GitHubRepositoryDto>> {
    return requireElectronApi().githubCreateRepo(name, description, isPrivate);
  },

  async mergePullRequest(params: {
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod: PullRequestMergeMethodDto;
  }): Promise<IpcResult<{ sha: string; merged: boolean; message: string }>> {
    return requireElectronApi().githubMergePR(params);
  },

  async getReleaseContext(params: {
    owner: string;
    repo: string;
    targetCommitish?: string;
  }): Promise<IpcResult<GitHubReleaseContextDto>> {
    return requireElectronApi().githubGetReleaseContext(params);
  },

  async createRelease(params: GitHubCreateReleaseParamsDto): Promise<IpcResult<GitHubReleaseDto>> {
    return requireElectronApi().githubCreateRelease(params);
  },

  async generateReleaseNotes(params: {
    tagName: string;
    releaseName: string;
    lastReleaseTag?: string | null;
    commits: ReleaseCommitDto[];
    repositoryHtmlUrl?: string | null;
    language: 'de' | 'en';
    versionBump: 'major' | 'minor' | 'patch';
    hints?: string[];
  }): Promise<IpcResult<{ markdown: string }>> {
    return requireElectronApi().aiGenerateReleaseNotes(params);
  },
};
