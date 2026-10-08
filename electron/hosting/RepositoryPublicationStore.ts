import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { RepositoryPublication } from '../../src/types/repositoryPublication';
import { writeTextFileAtomically } from '../main-process/atomicFile';
import { repositoryPathKey } from '../main-process/activeRepositoryAuthorization';

export interface StoredPublication extends RepositoryPublication {
  accountKey: string;
  gitDirectory: string;
  fingerprint: string;
  initialRemoteCount: number;
  expectedPath: string;
  preparedBranch: string;
  preparedHead: string;
}
export function publicationDto(record: StoredPublication): RepositoryPublication {
  const { id, selection, branches, tags, commitCount, stage, repository, candidate, remoteUrl, message, createdAt, updatedAt } = record;
  return { id, selection, branches, tags, commitCount, stage, repository, candidate, remoteUrl, message, createdAt, updatedAt };
}

/** Durable metadata only. An interrupted create never becomes a second create request. */
export class RepositoryPublicationStore {
  constructor(private readonly filePath: () => string = () => path.join(app.getPath('userData'), 'repository-publications.json')) {}
  private read(): StoredPublication[] {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath(), 'utf8')) as { version: number; publications: StoredPublication[] };
      if (
        value.version !== 1 ||
        !Array.isArray(value.publications) ||
        value.publications.some((p) => !p.id || !p.selection?.repoPath || !p.accountKey || !Array.isArray(p.branches))
      )
        throw new Error('Invalid publication store.');
      return value.publications;
    } catch (error) {
      if (fs.existsSync(this.filePath()))
        throw new Error('Repository publication records could not be read. The existing file was preserved.', { cause: error });
      return [];
    }
  }
  list(repoPath: string): StoredPublication[] {
    return this.read().filter((p) => repositoryPathKey(p.selection.repoPath) === repositoryPathKey(repoPath));
  }
  get(repoPath: string, id: string): StoredPublication {
    const record = this.list(repoPath).find((p) => p.id === id);
    if (!record) throw new Error('This publication does not belong to the active local repository.');
    return record;
  }
  save(record: StoredPublication): void {
    const records = this.read().filter((p) => p.id !== record.id);
    record.updatedAt = new Date().toISOString();
    records.push(record);
    writeTextFileAtomically(this.filePath(), JSON.stringify({ version: 1, publications: records }, null, 2) + '\n');
  }
}
