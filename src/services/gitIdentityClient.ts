import type { GitIdentityRequest, SaveGitIdentityRequest } from '@/shared/ipc/gitIdentity';
import { getElectronApi, requireElectronGitApi } from './electronApi';

export const gitIdentityClient = {
  isAvailable: () => Boolean(getElectronApi()?.git?.getGitIdentity),
  read: (request: GitIdentityRequest) => requireElectronGitApi().getGitIdentity(request),
  save: (request: SaveGitIdentityRequest) => requireElectronGitApi().saveGitIdentity(request),
};
