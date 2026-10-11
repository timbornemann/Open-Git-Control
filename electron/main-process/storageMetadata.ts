import * as fs from 'node:fs';
import * as path from 'node:path';
import { readStorageJson, assertManagedPath } from './storageSafety';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { writeTextFileAtomically } from './atomicFile';
import { createHash } from 'node:crypto';
import { isRepositoryUiPreferences } from '../../src/shared/ipc/repositoryUiPreferences';
import type { MaintenanceState } from './maintenanceState';
import type { StoredData } from './repoStore';
import { DAY } from './maintenanceState';

type Json = Record<string, any>;
export function repositoryMetadataOwners(root: string): Map<string, string> {
  const owners = new Map<string, string>();
  const add = (repo: unknown) => {
    if (typeof repo === 'string' && path.isAbsolute(repo)) owners.set(repositoryPathKey(repo), repo);
  };
  for (const name of [
    'repository-remotes.json',
    'repository-ui-state.json',
    'run-approvals.json',
    'repository-publications.json',
    'secret-scan-allowlist-migration.json',
  ]) {
    try {
      const data = readStorageJson(root, path.join(root, name)) as Json;
      if (!data || !(name === 'repository-remotes.json' ? [1, 2] : [1]).includes(data.version)) throw new Error(`Unsupported ${name}.`);
      if (name === 'repository-remotes.json' || name === 'repository-ui-state.json' || name === 'run-approvals.json') {
        if (!data.repositories || typeof data.repositories !== 'object' || Array.isArray(data.repositories)) throw new Error(`Invalid ${name}.`);
        if (name === 'repository-ui-state.json' && !Object.values(data.repositories).every(isRepositoryUiPreferences))
          throw new Error('Unsupported UI preferences.');
        Object.keys(data.repositories).forEach(add);
      } else if (name === 'repository-publications.json') {
        if (data.version !== 1 || !Array.isArray(data.publications)) throw new Error(`Invalid ${name}.`);
        data.publications.forEach((record: Json) => add(record.selection?.repoPath));
      } else {
        if (data.version !== 1 || !Array.isArray(data.repositories)) throw new Error(`Invalid ${name}.`);
        data.repositories.forEach((record: Json) => add(record.path));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const directory = path.join(root, 'repository-icons');
  assertManagedPath(root, directory);
  if (fs.existsSync(directory))
    for (const name of fs.readdirSync(directory))
      if (/^[a-f0-9]{64}\.json$/.test(name)) {
        const data = readStorageJson(root, path.join(directory, name)) as Json;
        if (data?.version === 1) add(data.repoPath);
      }
  return owners;
}
export function protectedRepositoryReferences(root: string): Set<string> {
  const protectedPaths = new Set<string>();
  const sources = [
    [
      'project-planner.json',
      (data: Json) => {
        if (data.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.items)) throw new Error('Invalid planning data.');
        return data.projects.map((project: Json) => project.repoPath);
      },
    ],
    [
      'repository-publications.json',
      (data: Json) => {
        if (data.version !== 1 || !Array.isArray(data.publications)) throw new Error('Invalid publication records.');
        return data.publications.filter((record: Json) => record.stage !== 'complete').map((record: Json) => record.selection?.repoPath);
      },
    ],
    [
      'secret-scan-allowlist-migration.json',
      (data: Json) => {
        if (data.version !== 1 || !Array.isArray(data.repositories) || !Array.isArray(data.rules)) throw new Error('Invalid migration records.');
        return data.repositories.filter((record: Json) => record.complete !== true).map((record: Json) => record.path);
      },
    ],
  ] as const;
  for (const [name, select] of sources) {
    try {
      const data = readStorageJson(root, path.join(root, name)) as Json;
      for (const repo of select(data)) {
        if (repo == null && name === 'project-planner.json') continue;
        if (typeof repo !== 'string' || !path.isAbsolute(repo)) throw new Error(`Unclear repository owner in ${name}.`);
        protectedPaths.add(repositoryPathKey(repo));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return protectedPaths;
}

/** Remove only named, expired keys, preserving all unrelated and unrecognized fields. */
export function pruneRepositoryMetadata(root: string, expired: Set<string>, dryRun = false, onRemovedFile?: () => void): number {
  let removed = 0;
  for (const name of [
    'repository-remotes.json',
    'repository-ui-state.json',
    'run-approvals.json',
    'repository-publications.json',
    'secret-scan-allowlist-migration.json',
  ]) {
    const file = path.join(root, name);
    let data: Json;
    try {
      data = readStorageJson(root, file) as Json;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const before = JSON.stringify(data);
    if (name === 'repository-remotes.json' || name === 'repository-ui-state.json' || name === 'run-approvals.json') {
      if (!(name === 'repository-remotes.json' ? [1, 2] : [1]).includes(data.version) || !data.repositories || Array.isArray(data.repositories))
        throw new Error(`Unsupported ${name}.`);
      for (const repo of Object.keys(data.repositories)) if (expired.has(repositoryPathKey(repo))) delete data.repositories[repo];
    } else if (name === 'repository-publications.json') {
      if (data.version !== 1 || !Array.isArray(data.publications)) throw new Error('Unsupported publication records.');
      data.publications = data.publications.filter((record: Json) => record.stage !== 'complete' || !expired.has(repositoryPathKey(record.selection.repoPath)));
    } else {
      if (data.version !== 1 || !Array.isArray(data.repositories)) throw new Error('Unsupported migration journal.');
      data.repositories = data.repositories.filter((record: Json) => record.complete !== true || !expired.has(repositoryPathKey(record.path)));
    }
    if (JSON.stringify(data) !== before) {
      const previousBytes = fs.statSync(file).size;
      const next = JSON.stringify(data, null, 2);
      if (!dryRun) writeTextFileAtomically(file, next, root);
      removed += Math.max(0, previousBytes - Buffer.byteLength(next));
    }
  }
  const directory = path.join(root, 'repository-icons');
  assertManagedPath(root, directory);
  if (fs.existsSync(directory))
    for (const name of fs.readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const file = path.join(directory, name);
      const data = readStorageJson(root, file) as Json;
      if (
        data.version === 1 &&
        typeof data.repoPath === 'string' &&
        path.isAbsolute(data.repoPath) &&
        name === `${createHash('sha256').update(repositoryPathKey(data.repoPath)).digest('hex')}.json` &&
        expired.has(repositoryPathKey(data.repoPath))
      ) {
        assertManagedPath(root, file);
        removed += fs.statSync(file).size;
        if (!dryRun) {
          fs.unlinkSync(file);
          onRemovedFile?.();
        }
      }
    }
  return removed;
}

export function reclaimableRepositoryMetadata(
  root: string,
  state: MaintenanceState,
  data: StoredData,
  now: number,
  recoveryPaths: Set<string>,
  isBusy: (repo: string) => boolean,
): number {
  repositoryMetadataOwners(root); // Validate every association format before predicting removals.
  const current = new Set(data.repos.map((entry) => repositoryPathKey(entry.path)));
  if (data.activeRepo) current.add(repositoryPathKey(data.activeRepo));
  const protectedPaths = protectedRepositoryReferences(root),
    expired = new Set<string>();
  for (const key of recoveryPaths) protectedPaths.add(key);
  for (const [key, ticket] of Object.entries(state.removed))
    if (now >= ticket.expiresAt && !current.has(key) && !protectedPaths.has(key) && !isBusy(ticket.entry.path)) expired.add(key);
  for (const [key, owner] of Object.entries(state.orphanOwners))
    if (now - owner.observedAt >= 30 * DAY && !current.has(key) && !protectedPaths.has(key) && !isBusy(owner.path)) expired.add(key);
  return pruneRepositoryMetadata(root, expired, true);
}
