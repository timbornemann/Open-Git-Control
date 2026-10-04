import { getElectronApi } from '@/services/electronApi';
import type { LegacyGithubAPI } from './contracts';

/** Only legacy test fixtures provide this namespace; production preload omits it. */
export const getLegacyGithubApi = (): LegacyGithubAPI | null => (getElectronApi() as unknown as { github?: LegacyGithubAPI } | null)?.github ?? null;
export const requireLegacyGithubApi = (): LegacyGithubAPI => {
  const api = getLegacyGithubApi();
  if (!api) throw new Error('The retired GitHub API is not available. Use the hosting API.');
  return api;
};
