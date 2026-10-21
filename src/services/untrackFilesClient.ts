import type { UntrackFilesApi } from '@/shared/ipc/untrackFiles';
import { requireElectronGitApi } from './electronApi';

export const untrackFilesClient: UntrackFilesApi = {
  inspectUntrackFiles: (request) => requireElectronGitApi().inspectUntrackFiles(request),
  executeUntrackFiles: (request) => requireElectronGitApi().executeUntrackFiles(request),
  cancelUntrackFiles: (id) => requireElectronGitApi().cancelUntrackFiles(id),
};
