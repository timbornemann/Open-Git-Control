import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from '../../GitService';
import type { HostingService } from '../HostingService';
import { discoverLocalHostingWorkflows, getLocalHostingWorkflows } from '../HostingLocalWorkflows';

let root: string;
let repo: string;
const file = (name: string, content: string) => {
  const target = path.join(repo, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-local-workflows-'));
  repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
});
afterEach(async () => {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-local-workflows-'))
    throw new Error('Invalid workflow test cleanup directory.');
  await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('local workflow discovery', () => {
  it('offers manually dispatchable GitHub workflows with names and filenames, excluding automatic workflows and nested files', async () => {
    file('.github/workflows/release.yaml', 'name: Release application\non: { workflow_dispatch: { inputs: { version: { required: true } } } }\n');
    file('.github/workflows/array.yml', 'on: [push, workflow_dispatch]\n');
    file('.github/workflows/scalar.yml', 'on: workflow_dispatch\n');
    file('.github/workflows/automatic.yml', 'name: Build\non: [push, pull_request]\n');
    file('.github/workflows/not-yaml.txt', 'on: workflow_dispatch\n');
    file('.github/workflows/nested/hidden.yml', 'on: workflow_dispatch\n');
    expect(await discoverLocalHostingWorkflows(repo, 'github')).toEqual({
      provider: 'github',
      workflows: [
        { id: 'array.yml', name: 'array.yml', filePath: '.github/workflows/array.yml' },
        { id: 'release.yaml', name: 'Release application', filePath: '.github/workflows/release.yaml' },
        { id: 'scalar.yml', name: 'scalar.yml', filePath: '.github/workflows/scalar.yml' },
      ],
      files: ['.github/workflows/array.yml', '.github/workflows/automatic.yml', '.github/workflows/release.yaml', '.github/workflows/scalar.yml'],
      issues: [],
    });
  });

  it('uses Forgejo configurations and falls back to GitHub only when the Forgejo directory is absent', async () => {
    file('.github/workflows/github.yml', 'on: workflow_dispatch\n');
    expect((await discoverLocalHostingWorkflows(repo, 'forgejo')).workflows[0].id).toBe('github.yml');
    fs.mkdirSync(path.join(repo, '.forgejo/workflows'), { recursive: true });
    expect((await discoverLocalHostingWorkflows(repo, 'forgejo')).workflows).toEqual([]);
    file('.forgejo/workflows/deploy.yml', 'name: Private deployment\non:\n  workflow_dispatch:\n');
    expect((await discoverLocalHostingWorkflows(repo, 'forgejo')).workflows).toEqual([
      { id: 'deploy.yml', name: 'Private deployment', filePath: '.forgejo/workflows/deploy.yml' },
    ]);
    expect((await discoverLocalHostingWorkflows(repo, 'github')).workflows[0].id).toBe('github.yml');
  });

  it('reads Bitbucket custom selectors and the default pipeline, without mistaking branch or step names for pipelines', async () => {
    file(
      'bitbucket-pipelines.yml',
      'pipelines:\n  default:\n    - step: { name: Build, script: [echo hello] }\n  branches:\n    main: []\n  custom:\n    deploy-production:\n      - variables: [{name: ENVIRONMENT}]\n      - step: {script: [echo deploy]}\n    test-on-demand: { import: shared:main:ci }\n',
    );
    expect((await discoverLocalHostingWorkflows(repo, 'bitbucket-cloud')).workflows).toEqual([
      { id: 'default', name: 'Default pipeline', filePath: 'bitbucket-pipelines.yml' },
      { id: 'deploy-production', name: 'deploy-production', filePath: 'bitbucket-pipelines.yml' },
      { id: 'test-on-demand', name: 'test-on-demand', filePath: 'bitbucket-pipelines.yml' },
    ]);
  });

  it('offers the GitLab pipeline for a ref, without treating local manual job names as remote job IDs or resolving includes', async () => {
    file(
      '.gitlab-ci.yml',
      'spec: { inputs: { environment: { default: staging } } }\n---\ninclude: { local: ../outside.yml }\nstages: [test]\nmanual-job: { when: manual, script: [!reference [.template, script]] }\n',
    );
    expect((await discoverLocalHostingWorkflows(repo, 'gitlab')).workflows).toEqual([{ id: '', name: 'Pipeline', filePath: '.gitlab-ci.yml' }]);
    expect((await discoverLocalHostingWorkflows(repo, 'bitbucket-data-center')).workflows).toEqual([]);
  });

  it('reports malformed, duplicate-key, unknown-tag, excessive-alias and oversized YAML while retaining valid suggestions', async () => {
    file('.github/workflows/good.yml', 'on: workflow_dispatch\n');
    file('.github/workflows/bad.yml', 'on: [\n');
    file('.github/workflows/duplicate.yml', 'on: push\non: workflow_dispatch\n');
    file('.github/workflows/tag.yml', 'on: !execute workflow_dispatch\n');
    file('.github/workflows/multi.yml', 'on: workflow_dispatch\n---\non: workflow_dispatch\n');
    file('.github/workflows/aliases.yml', 'a: &a [one, two]\nb: &b [*a, *a, *a, *a, *a]\non: [*b, *b, *b, *b, *b, *b, *b]\n');
    file('.github/workflows/large.yml', 'a'.repeat(256 * 1024 + 1));
    const result = await discoverLocalHostingWorkflows(repo, 'github');
    expect(result.workflows.map((entry) => entry.id)).toEqual(['good.yml']);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { filePath: '.github/workflows/bad.yml', reason: 'invalid' },
        { filePath: '.github/workflows/duplicate.yml', reason: 'invalid' },
        { filePath: '.github/workflows/tag.yml', reason: 'invalid' },
        { filePath: '.github/workflows/multi.yml', reason: 'invalid' },
        { filePath: '.github/workflows/aliases.yml', reason: 'invalid' },
        { filePath: '.github/workflows/large.yml', reason: 'too-large' },
      ]),
    );
  });

  it('does not follow linked workflow directories outside the repository', async () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'private.yml'), 'on: workflow_dispatch\n');
    fs.mkdirSync(path.join(repo, '.github'));
    fs.symlinkSync(outside, path.join(repo, '.github/workflows'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await discoverLocalHostingWorkflows(repo, 'github')).toMatchObject({
      workflows: [],
      files: [],
      issues: [{ filePath: '.github/workflows', reason: 'unreadable' }],
    });
  });

  it('limits discovered files and reads new local changes on subsequent requests', async () => {
    for (let index = 0; index < 102; index++) file(`.github/workflows/${index}.yml`, 'on: workflow_dispatch\n');
    const result = await discoverLocalHostingWorkflows(repo, 'github');
    expect(result.files).toHaveLength(100);
    expect(result.workflows).toHaveLength(100);
    expect(result.issues).toContainEqual({ filePath: '.github/workflows', reason: 'limit' });
    file('.github/workflows/0.yml', 'on: push\n');
    expect((await discoverLocalHostingWorkflows(repo, 'github')).workflows).toHaveLength(99);
  });

  it('pins local reads to the active repository and hosting account, with no network or authentication request', async () => {
    file('.github/workflows/ci.yml', 'on: workflow_dispatch\n');
    const repository = { connectionId: 'selected-account', repositoryId: '42', fullPath: 'team/repo' };
    const git = { getRepoPath: () => repo } as GitService;
    const validateRepository = vi.fn();
    const generation = vi.fn(() => 0);
    const connection = vi.fn(() => ({ provider: 'github' }));
    const service = { validateRepository, generation, connection } as unknown as HostingService;
    expect((await getLocalHostingWorkflows({ repository, repoPath: repo }, git, service)).workflows[0].id).toBe('ci.yml');
    expect(validateRepository).toHaveBeenCalledWith(repository);
    expect(connection).toHaveBeenCalledWith('selected-account');
    await expect(getLocalHostingWorkflows({ repository, repoPath: root }, git, service, () => [])).rejects.toThrow('not the active repository');
    generation.mockReturnValueOnce(0).mockReturnValue(1);
    await expect(getLocalHostingWorkflows({ repository, repoPath: repo }, git, service)).rejects.toThrow('account changed');
  });

  it('reads exact saved inactive clones without activating them, while rejecting arbitrary or unregistered descendants', async () => {
    file('.github/workflows/ci.yml', 'on: workflow_dispatch\n');
    const repository = { connectionId: 'selected-account', repositoryId: '42', fullPath: 'team/repo' };
    const getRepoPath = vi.fn(() => path.join(root, 'another-active-repo'));
    const git = { getRepoPath } as unknown as GitService;
    const service = { validateRepository: vi.fn(), generation: () => 0, connection: () => ({ provider: 'github' }) } as unknown as HostingService;
    const saved = () => [repo];
    expect((await getLocalHostingWorkflows({ repository, repoPath: repo }, git, service, saved)).workflows[0].id).toBe('ci.yml');
    expect(getRepoPath()).toBe(path.join(root, 'another-active-repo'));
    await expect(getLocalHostingWorkflows({ repository, repoPath: root }, git, service, saved)).rejects.toThrow('not the active repository');
    await expect(getLocalHostingWorkflows({ repository, repoPath: path.join(repo, '.github') }, git, service, saved)).rejects.toThrow(
      'not the active repository',
    );
    await expect(getLocalHostingWorkflows({ repository, repoPath: repo }, git, service, () => [])).rejects.toThrow('not the active repository');
  });
});
