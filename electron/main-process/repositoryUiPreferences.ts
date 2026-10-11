import { app } from 'electron';
import * as path from 'node:path';
import { readStorageJson } from './storageSafety';
import { writeTextFileAtomically } from './atomicFile';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { readStoreData } from './repoStore';
import { isRepositoryUiPreferences, type RepositoryUiPreferences } from '../../src/shared/ipc/repositoryUiPreferences';

type Store = { version: 1; repositories: Record<string, RepositoryUiPreferences> };
const root = () => app.getPath('userData');
const file = () => path.join(root(), 'repository-ui-state.json');
function validateMap(value: unknown): asserts value is Store['repositories'] {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.entries(value).some(([repo, entry]) => !path.isAbsolute(repo) || !isRepositoryUiPreferences(entry))
  )
    throw new Error('Unsupported repository UI preferences.');
}
function read(): Store {
  try {
    const stored = readStorageJson(root(), file()) as Store;
    if (!stored || stored.version !== 1) throw new Error('Unsupported UI preferences version.');
    validateMap(stored.repositories);
    return stored;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, repositories: {} };
    throw error;
  }
}
/** One-time migration retains orphan owners for the central 30-day observation period. */
export function readRepositoryUiPreferences(legacy?: unknown): Store['repositories'] {
  const stored = read();
  if (legacy !== undefined) {
    validateMap(legacy);
    let changed = false;
    for (const [repo, entry] of Object.entries(legacy)) {
      const key = repositoryPathKey(repo);
      if (!(key in stored.repositories)) {
        stored.repositories[key] = entry;
        changed = true;
      }
    }
    if (changed) writeTextFileAtomically(file(), JSON.stringify(stored), root());
  }
  return stored.repositories;
}
export function updateRepositoryUiPreferences(request: { repoPath: string; patch: RepositoryUiPreferences }): Store['repositories'] {
  if (!request || typeof request.repoPath !== 'string' || !path.isAbsolute(request.repoPath) || !isRepositoryUiPreferences(request.patch))
    throw new Error('Invalid UI preferences update.');
  const entry = readStoreData().repos.find((repo) => repositoryPathKey(repo.path) === repositoryPathKey(request.repoPath));
  if (!entry) throw new Error('The repository is no longer registered.');
  const stored = read(),
    key = repositoryPathKey(entry.path);
  stored.repositories[key] = { ...stored.repositories[key], ...request.patch };
  writeTextFileAtomically(file(), JSON.stringify(stored), root());
  return stored.repositories;
}
