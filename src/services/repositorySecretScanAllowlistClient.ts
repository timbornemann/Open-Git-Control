import { requireElectronGitApi, getElectronApi } from './electronApi';
import type {
  AddRepositorySecretScanAllowlistPathsDto,
  SaveRepositorySecretScanAllowlistDto,
  SecretScanAllowlistMigrationDto,
} from '@/types/repositorySecretScanAllowlist';

type MigrationListener = (repoPath: string, report: SecretScanAllowlistMigrationDto) => void;
const migrationListeners = new Set<MigrationListener>();

// Policy reads deliberately bypass the Git-data cache: scans and edits must
// observe the saved working-tree file, including untracked external changes.
export const repositorySecretScanAllowlistClient = {
  isAvailable: () => Boolean(getElectronApi()),
  get: async (repoPath: string) => {
    const result = await requireElectronGitApi().getRepositorySecretScanAllowlist(repoPath);
    if (result.success && result.data.migration) {
      for (const callback of migrationListeners) callback(repoPath, result.data.migration);
    }
    return result;
  },
  onMigration: (callback: MigrationListener) => {
    migrationListeners.add(callback);
    return () => {
      migrationListeners.delete(callback);
    };
  },
  save: (request: SaveRepositorySecretScanAllowlistDto) => requireElectronGitApi().saveRepositorySecretScanAllowlist(request),
  addPaths: (request: AddRepositorySecretScanAllowlistPathsDto) => requireElectronGitApi().addRepositorySecretScanAllowlistPaths(request),
  watch: async (repoPath: string | null) => requireElectronGitApi().watchRepositorySecretScanAllowlist(repoPath),
  onChanged: (callback: (repoPath: string) => void) => requireElectronGitApi().onRepositorySecretScanAllowlistChanged(callback),
};

export async function addSecretScanFindingPaths(repoPath: string, findings: { filePath: string }[]): Promise<void> {
  const current = await repositorySecretScanAllowlistClient.get(repoPath);
  if (!current.success) throw new Error(current.error);
  const result = await repositorySecretScanAllowlistClient.addPaths({
    repoPath,
    paths: findings.map((finding) => finding.filePath),
    expectedVersion: current.data.version,
  });
  if (!result.success) throw new Error(result.error);
}
