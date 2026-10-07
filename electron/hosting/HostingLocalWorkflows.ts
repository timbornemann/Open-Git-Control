import * as fs from 'fs';
import * as path from 'path';
import { parseAllDocuments } from 'yaml';
import type { GitService } from '../GitService';
import type { HostingService } from './HostingService';
import type { HostingOperations } from '../../src/shared/ipc/contracts/hosting';
import type { HostingLocalWorkflows, HostingProvider, HostingWorkflowSuggestion } from '../../src/types/hostingDtos';
import { resolveExistingRepositoryPathWithoutSymlinks } from '../git/RepositoryPathSafety';
import { repositoryPathKey, requireActiveRepositoryPath } from '../main-process/activeRepositoryAuthorization';
import { readStoreData } from '../main-process/repoStore';
import { repoJobRegistry } from '../main-process/repoJobRegistry';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_WORKFLOWS = 100;
const map = (value: unknown): Map<unknown, unknown> => (value instanceof Map ? value : new Map());
const hasDispatch = (value: unknown): boolean =>
  value === 'workflow_dispatch' || (Array.isArray(value) && value.includes('workflow_dispatch')) || map(value).has('workflow_dispatch');

/** Reads configuration only: no includes, commands, credentials or network requests. */
export async function discoverLocalHostingWorkflows(repoPath: string, provider: HostingProvider, assertCurrent = () => {}): Promise<HostingLocalWorkflows> {
  const result: HostingLocalWorkflows = { provider, workflows: [], files: [], issues: [] };
  let totalBytes = 0;
  const issue = (filePath: string, reason: HostingLocalWorkflows['issues'][number]['reason']) => result.issues.push({ filePath, reason });
  const exists = async (relativePath: string) => {
    try {
      await fs.promises.lstat(path.join(repoPath, relativePath));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  };
  const read = async (filePath: string): Promise<Map<unknown, unknown> | null> => {
    assertCurrent();
    result.files.push(filePath);
    let text: string;
    try {
      const target = resolveExistingRepositoryPathWithoutSymlinks(repoPath, filePath, 'Workflow file');
      const handle = await fs.promises.open(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw new Error('Not a regular workflow file.');
        if (stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) {
          issue(filePath, 'too-large');
          return null;
        }
        const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
        let size = 0;
        while (size < buffer.length) {
          const chunk = await handle.read(buffer, size, buffer.length - size, null);
          if (!chunk.bytesRead) break;
          size += chunk.bytesRead;
        }
        if (size > MAX_FILE_BYTES || totalBytes + size > MAX_TOTAL_BYTES) {
          issue(filePath, 'too-large');
          return null;
        }
        resolveExistingRepositoryPathWithoutSymlinks(repoPath, filePath, 'Workflow file');
        totalBytes += size;
        text = buffer.subarray(0, size).toString('utf8');
      } finally {
        await handle.close();
      }
    } catch {
      issue(filePath, 'unreadable');
      return null;
    }
    assertCurrent();
    try {
      const documents = parseAllDocuments(text, {
        uniqueKeys: true,
        merge: true,
        // Preserve GitLab references as data; do not resolve their targets.
        customTags: provider === 'gitlab' ? [{ tag: '!reference', collection: 'seq', resolve: (value) => value }] : [],
      });
      if (!documents.length || documents.length > (provider === 'gitlab' ? 2 : 1)) throw new Error('Invalid workflow document count.');
      let config: Map<unknown, unknown> | null = null;
      for (const document of documents) {
        if (document.errors.length || document.warnings.length) throw new Error('Invalid workflow YAML.');
        const value: unknown = document.toJS({ mapAsMap: true, maxAliasCount: 20 });
        if (!(value instanceof Map)) throw new Error('Workflow configuration must be a mapping.');
        config = value;
      }
      return config;
    } catch {
      issue(filePath, 'invalid');
      return null;
    }
  };
  const add = (suggestion: HostingWorkflowSuggestion) => {
    if (result.workflows.length < MAX_WORKFLOWS) result.workflows.push(suggestion);
    else if (!result.issues.some((entry) => entry.reason === 'limit')) issue(suggestion.filePath, 'limit');
  };
  if (provider === 'github' || provider === 'forgejo') {
    // Forgejo uses the GitHub directory only if its own directory is absent.
    const directory = provider === 'forgejo' && (await exists('.forgejo/workflows')) ? '.forgejo/workflows' : '.github/workflows';
    if (await exists(directory)) {
      try {
        const target = resolveExistingRepositoryPathWithoutSymlinks(repoPath, directory, 'Workflow directory');
        const files = (await fs.promises.readdir(target, { withFileTypes: true }))
          .filter((entry) => /\.ya?ml$/i.test(entry.name) && !/[\0\r\n]/.test(entry.name))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (files.length > MAX_WORKFLOWS) issue(directory, 'limit');
        for (const file of files.slice(0, MAX_WORKFLOWS)) {
          const filePath = `${directory}/${file.name}`;
          const config = await read(filePath);
          if (config && hasDispatch(config.get('on'))) {
            const name = config.get('name');
            add({ id: file.name, name: typeof name === 'string' && name.trim() ? name.trim() : file.name, filePath });
          }
        }
      } catch (error) {
        assertCurrent();
        if (error instanceof Error) issue(directory, 'unreadable');
      }
    }
  } else if (provider === 'bitbucket-cloud' && (await exists('bitbucket-pipelines.yml'))) {
    const config = await read('bitbucket-pipelines.yml');
    const pipelines = map(config?.get('pipelines'));
    if (pipelines.has('default')) add({ id: 'default', name: 'Default pipeline', filePath: 'bitbucket-pipelines.yml' });
    for (const [id, value] of map(pipelines.get('custom'))) {
      if (typeof id === 'string' && id.trim() && id !== 'default' && (Array.isArray(value) || value instanceof Map))
        add({ id, name: id, filePath: 'bitbucket-pipelines.yml' });
    }
  } else if (provider === 'gitlab' && (await exists('.gitlab-ci.yml'))) {
    // The dispatch API creates a pipeline for a ref, not for a local job name.
    if (await read('.gitlab-ci.yml')) add({ id: '', name: 'Pipeline', filePath: '.gitlab-ci.yml' });
  }
  assertCurrent();
  return result;
}

export async function getLocalHostingWorkflows(
  input: HostingOperations['localWorkflows']['input'],
  gitService: GitService,
  hostingService: HostingService,
  readStoredRepoPaths = () => readStoreData().repos.map((entry) => entry.path),
): Promise<HostingLocalWorkflows> {
  const authorize = () => {
    try {
      return requireActiveRepositoryPath(input.repoPath, gitService.getRepoPath(), 'hosting:localWorkflows');
    } catch (error) {
      // Like remote/logo reads, discovery may read exact, main-owned saved
      // clones without changing the active repository. This grants no writes.
      const saved = readStoredRepoPaths().find((entry) => repositoryPathKey(entry) === repositoryPathKey(input.repoPath));
      if (!saved) throw error;
      return saved;
    }
  };
  const repoPath = authorize();
  hostingService.validateRepository(input.repository);
  const generation = hostingService.generation(input.repository.connectionId);
  const repoGeneration = repoJobRegistry.getGeneration();
  return discoverLocalHostingWorkflows(repoPath, hostingService.connection(input.repository.connectionId).provider, () => {
    if (repositoryPathKey(authorize()) !== repositoryPathKey(repoPath)) throw new Error('The local workflow repository changed.');
    if (generation !== hostingService.generation(input.repository.connectionId) || repoGeneration !== repoJobRegistry.getGeneration())
      throw new Error('The repository or hosting account changed while reading workflows.');
  });
}
