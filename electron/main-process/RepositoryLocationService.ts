import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService } from '../GitService';
import { toolExecutable } from '../system-tools/toolRuntime';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { readStoreData, notifyRepoStoreChanged, type StoredData } from './repoStore';
import { prepareRepositoryLocationMetadata, publishRepositoryLocationMetadata } from './repositoryLocationMetadata';
import { relocateKnownPlannerRepository } from './projectPlannerStore';

export class RepositoryLocationService {
  constructor(
    private readonly git: Pick<GitService['runner'], 'run'>,
    private readonly directory: () => string = () => app.getPath('userData'),
  ) {}

  private saved(requested: string, data: StoredData = readStoreData()): string {
    if (typeof requested !== 'string' || !requested.trim() || !path.isAbsolute(requested)) throw new Error('Choose a saved repository.');
    const entry = data.repos.find((repo) => repositoryPathKey(repo.path) === repositoryPathKey(requested));
    if (!entry) throw new Error('The saved repository changed. Reopen its recovery dialog.');
    return entry.path;
  }

  private async resolve(candidate: string): Promise<string> {
    toolExecutable('git');
    if (!fs.statSync(candidate).isDirectory()) throw new Error('The selected location is not a directory.');
    const options = { signal: AbortSignal.timeout(10_000) };
    const bare = (await this.git.run(candidate, ['rev-parse', '--is-bare-repository'], options)).trim();
    if (!['true', 'false'].includes(bare)) throw new Error('The selected folder is not a Git repository.');
    const root = (await this.git.run(candidate, ['rev-parse', bare === 'true' ? '--absolute-git-dir' : '--show-toplevel'], options)).trim();
    if (!root || !path.isAbsolute(root)) throw new Error('The Git repository root could not be determined.');
    if (!fs.statSync(root).isDirectory()) throw new Error('The Git repository root is unavailable.');
    return path.resolve(root);
  }

  async recheck(repoPath: string, current: () => void): Promise<string> {
    const saved = this.saved(repoPath);
    current();
    const root = await this.resolve(saved);
    current();
    this.saved(saved);
    return root;
  }

  async relocate(repoPath: string, candidate: string, current: () => void): Promise<string> {
    const saved = this.saved(repoPath);
    current();
    if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) throw new Error('Choose the new repository folder.');
    const root = await this.resolve(candidate);
    current();
    if (repositoryPathKey(root) === repositoryPathKey(saved)) return root;
    // Selecting a folder cannot replace a repository which became available meanwhile.
    let originalAvailable = false;
    try {
      await this.resolve(saved);
      originalAvailable = true;
    } catch {
      toolExecutable('git');
    }
    current();
    if (originalAvailable) throw new Error('The original repository is available again. Use Recheck to reopen it.');
    const data = readStoreData();
    this.saved(saved, data);
    if (data.repos.some((repo) => repositoryPathKey(repo.path) === repositoryPathKey(root)))
      throw new Error('The selected repository is already in your list. Its settings were not replaced.');
    const next: StoredData = {
      ...data,
      repos: data.repos.map((repo) => (repositoryPathKey(repo.path) === repositoryPathKey(saved) ? { ...repo, path: root } : repo)),
      activeRepo: data.activeRepo && repositoryPathKey(data.activeRepo) === repositoryPathKey(saved) ? root : data.activeRepo,
    };
    const changes = prepareRepositoryLocationMetadata(this.directory(), saved, root, next);
    current();
    publishRepositoryLocationMetadata(changes);
    notifyRepoStoreChanged();
    relocateKnownPlannerRepository(saved, root);
    return root;
  }
}
