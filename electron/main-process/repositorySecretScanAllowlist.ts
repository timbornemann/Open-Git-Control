import { app } from 'electron';
import * as path from 'path';
import { GitRunner } from '../git/GitRunner';
import { repositorySecretScanAllowlistFiles } from './RepositorySecretScanAllowlistService';
import { SecretScanAllowlistMigration } from './SecretScanAllowlistMigration';

const runner = new GitRunner();
export const secretScanAllowlistMigration = new SecretScanAllowlistMigration(
  () => path.join(app.getPath('userData'), 'secret-scan-allowlist-migration.json'),
  repositorySecretScanAllowlistFiles,
  async (repoPath) => (await runner.run(repoPath, ['ls-files', '-z'])).split('\0').filter(Boolean),
);

export const repositorySecretScanAllowlistService = {
  async prepare(repoPath: string, forEditing = false) {
    await secretScanAllowlistMigration.prepare(repoPath);
    return forEditing ? repositorySecretScanAllowlistFiles.readForEditing(repoPath) : repositorySecretScanAllowlistFiles.read(repoPath);
  },
  read: (repoPath: string) => repositorySecretScanAllowlistFiles.read(repoPath),
  assertVersion: (repoPath: string, version: string) => repositorySecretScanAllowlistFiles.assertVersion(repoPath, version),
  save: (repoPath: string, text: unknown, version: unknown) => repositorySecretScanAllowlistFiles.save(repoPath, text, version),
  addPaths: (repoPath: string, paths: unknown, version: unknown) => repositorySecretScanAllowlistFiles.addPaths(repoPath, paths, version),
};

export type RepositorySecretScanAllowlistReader = Pick<typeof repositorySecretScanAllowlistService, 'read' | 'prepare' | 'assertVersion'>;
