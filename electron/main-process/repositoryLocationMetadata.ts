import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { writeTextFileAtomically } from './atomicFile';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import type { StoredData } from './repoStore';
import { normalizeRemotePreferences } from '../git/remoteTransferValidation';
import { parsePlannerData } from './repositoryPlanningFile';
import type { StoredPublication } from '../hosting/RepositoryPublicationStore';

interface Change {
  file: string;
  before: string | null;
  after: string;
}
const read = (file: string): string | null => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};

/** Prepare every store before writing any of them. Repository-local files are never rewritten. */
export function prepareRepositoryLocationMetadata(directory: string, oldPath: string, newPath: string, repos: StoredData): Change[] {
  const changes: Change[] = [];
  const oldKey = repositoryPathKey(oldPath),
    newKey = repositoryPathKey(newPath);
  const add = (file: string, value: unknown) => changes.push({ file, before: read(file), after: `${JSON.stringify(value, null, 2)}\n` });
  const remoteFile = path.join(directory, 'repository-remotes.json');
  const remoteRaw = read(remoteFile);
  if (remoteRaw !== null) {
    const store = JSON.parse(remoteRaw);
    if (![1, 2].includes(store.version) || !store.repositories || typeof store.repositories !== 'object' || Array.isArray(store.repositories))
      throw new Error('Remote preferences could not be read. The existing file was preserved.');
    if (Object.hasOwn(store.repositories, oldKey)) {
      if (Object.hasOwn(store.repositories, newKey)) throw new Error('The new location already has remote preferences. Nothing was replaced.');
      normalizeRemotePreferences(store.repositories[oldKey]);
      store.repositories[newKey] = store.repositories[oldKey];
      delete store.repositories[oldKey];
      add(remoteFile, store);
    }
  }

  const legacyFile = path.join(directory, 'project-planner.json');
  const legacyRaw = read(legacyFile);
  if (legacyRaw !== null) {
    const data = parsePlannerData(legacyRaw, 'Planner data');
    const moved = data.projects.filter((p) => p.kind === 'repository' && p.repoPath && repositoryPathKey(p.repoPath) === oldKey);
    if (moved.length) {
      if (data.projects.some((p) => p.repoPath && repositoryPathKey(p.repoPath) === newKey))
        throw new Error('The new location already has planning data. Nothing was replaced.');
      for (const project of moved) project.repoPath = newPath;
      add(legacyFile, data);
    }
  }

  const publicationFile = path.join(directory, 'repository-publications.json');
  const publicationRaw = read(publicationFile);
  if (publicationRaw !== null) {
    const data = JSON.parse(publicationRaw) as { version: number; publications: StoredPublication[] };
    if (data.version !== 1 || !Array.isArray(data.publications)) throw new Error('Repository publication records could not be read.');
    const moved = data.publications.filter((p) => repositoryPathKey(p.selection.repoPath) === oldKey);
    if (moved.length) {
      if (data.publications.some((p) => repositoryPathKey(p.selection.repoPath) === newKey))
        throw new Error('The new location already has publication records. Nothing was replaced.');
      for (const publication of moved) {
        publication.selection.repoPath = newPath;
        const relative = path.relative(oldPath, publication.gitDirectory);
        if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) publication.gitDirectory = path.join(newPath, relative);
        // Account, ref and remote fingerprints remain intact. Resuming still revalidates them.
      }
      add(publicationFile, data);
    }
  }

  const iconFile = (repo: string) => path.join(directory, 'repository-icons', `${createHash('sha256').update(repositoryPathKey(repo)).digest('hex')}.json`);
  const iconRaw = read(iconFile(oldPath));
  if (iconRaw !== null) {
    // A broken preview cache must not prevent finding the repository again.
    try {
      const data = JSON.parse(iconRaw);
      if (data.version === 1 && repositoryPathKey(data.repoPath) === oldKey) {
        add(iconFile(newPath), { ...data, repoPath: newPath, selectionVersion: randomUUID(), scannedAt: 0 });
      }
    } catch {
      // Logos can be rediscovered; authoritative stores above may not be discarded.
    }
  }
  // Publish the saved path last, after its settings are present at the new key.
  add(path.join(directory, 'repos.json'), repos);
  return changes;
}

/** Each file is atomically replaced. Roll back only our own writes on failure. */
export function publishRepositoryLocationMetadata(changes: Change[]): void {
  const written: Change[] = [];
  try {
    for (const change of changes) {
      if (read(change.file) !== change.before) throw new Error('Repository settings changed. Please retry locating the repository.');
      writeTextFileAtomically(change.file, change.after);
      written.push(change);
    }
  } catch (error) {
    const failures: string[] = [];
    for (const change of written.reverse()) {
      try {
        if (read(change.file) !== change.after) throw new Error('The file was changed externally.');
        if (change.before === null) fs.unlinkSync(change.file);
        else writeTextFileAtomically(change.file, change.before);
      } catch {
        failures.push(path.basename(change.file));
      }
    }
    if (failures.length) throw new Error(`Location update failed; check these settings files before retrying: ${failures.join(', ')}.`, { cause: error });
    throw error;
  }
}
