import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GitService } from '../../GitService';
import type { HostingService } from '../HostingService';
import type { HostingAdapter } from '../HostingAdapter';
import type { HostingConnection, HostedRepository } from '../../../src/types/hostingDtos';
import type { PublicationSelection } from '../../../src/types/repositoryPublication';
import { GitRunner } from '../../git/GitRunner';
import { RemoteTransferService } from '../../git/RemoteTransferService';
import { RemotePreferencesStore } from '../../git/RemotePreferencesStore';
import { RepositoryPublicationService } from '../RepositoryPublicationService';
import { RepositoryPublicationStore } from '../RepositoryPublicationStore';
import { HostingHttpError } from '../providers/HostingHttpTransport';
import { repoJobRegistry } from '../../main-process/repoJobRegistry';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  repoJobRegistry.cancelForRepoChange(null);
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

function fixture(empty = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-publication-'));
  directories.push(root);
  const repo = path.join(root, 'project'),
    bare = path.join(root, 'target.git');
  fs.mkdirSync(repo);
  fs.mkdirSync(bare);
  git(repo, 'init', '-b', 'main');
  git(bare, 'init', '--bare');
  git(repo, 'config', 'user.name', 'Publication Test');
  git(repo, 'config', 'user.email', 'publication@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  const commit = (message: string) => {
    fs.writeFileSync(path.join(repo, 'file.txt'), message);
    git(repo, 'add', 'file.txt');
    git(repo, 'commit', '-m', message);
    return git(repo, 'rev-parse', 'HEAD');
  };
  const initial = empty ? '' : commit('first');
  let existing = false,
    generation = 0,
    activePath = repo,
    defaultBranch = 'main';
  const connection: HostingConnection = {
    id: 'account',
    provider: 'github',
    label: 'Alice',
    baseUrl: 'https://host.invalid',
    apiBaseUrl: 'https://host.invalid/api',
    username: 'alice',
    userId: '7',
    authenticated: true,
    hasCredentials: true,
  };
  const url = 'https://host.invalid/alice/project.git';
  const repository = (): HostedRepository => ({
    ref: { connectionId: connection.id, repositoryId: '51', fullPath: 'alice/project' },
    name: 'project',
    fullName: 'alice/project',
    description: null,
    private: true,
    cloneUrl: url,
    sshUrl: 'git@host.invalid:alice/project.git',
    htmlUrl: 'https://host.invalid/alice/project',
    defaultBranch,
    fork: false,
  });
  const create = vi.fn(async () => {
    existing = true;
    return repository();
  });
  const setDefaultBranch = vi.fn(async (_ref, name: string) => {
    defaultBranch = name;
  });
  const adapter = {
    capabilities: vi.fn(async () => ({ createRepository: true })),
    verifyCreationTarget: vi.fn(async () => ({ id: 'alice', namespace: 'alice', label: 'Alice', kind: 'personal', visibility: ['private', 'public'] })),
    repository: vi.fn(async () => {
      if (!existing) throw new HostingHttpError(404, 'not_found', 'Absent');
      return repository();
    }),
    createRepository: create,
    resolveRepository: vi.fn(async () => (existing ? repository() : null)),
    setDefaultBranch,
  } as unknown as HostingAdapter;
  const hosting = {
    connection: () => connection,
    authenticatedAdapter: async () => adapter,
    generation: () => generation,
    getConnectionSignal: () => new AbortController().signal,
    validateRepository: vi.fn(),
  } as unknown as HostingService;
  const runner = new GitRunner();
  const run = runner.run.bind(runner),
    runResult = runner.runResult.bind(runner);
  // Real Git operations reach isolated bare repositories, never a hosting service.
  const networkArgs = (args: string[]) =>
    ['fetch', 'push', 'ls-remote'].includes(args[0]) ? ['-c', `url.${bare.replace(/\\/g, '/')}.insteadOf=${url}`, ...args] : args;
  vi.spyOn(runner, 'run').mockImplementation((cwd, args, options) => run(cwd, networkArgs(args), options));
  vi.spyOn(runner, 'runResult').mockImplementation((cwd, args, options) => runResult(cwd, networkArgs(args), options));
  vi.spyOn(runner, 'withExclusiveWrite').mockImplementation(async (_cwd, _name, work) =>
    work({ run: runner.run.bind(runner), buffer: async () => Buffer.alloc(0), input: async () => '' }),
  );
  const gitService = { runner, getRepoPath: () => activePath } as unknown as GitService;
  const preferences = new RemotePreferencesStore(() => path.join(root, 'preferences.json'));
  const store = new RepositoryPublicationStore(() => path.join(root, 'publications.json'));
  const makeService = () => new RepositoryPublicationService({ gitService, hostingService: hosting, preferences, store });
  const service = makeService();
  repoJobRegistry.cancelForRepoChange(repo);
  const selection: PublicationSelection = {
    repoPath: repo,
    creation: { connectionId: connection.id, namespace: 'alice', name: 'project', private: true },
    remoteName: 'origin',
    transport: 'https',
    credentialMode: 'system',
    makePrimary: false,
    branches: initial ? [{ sourceBranch: 'main', destinationBranch: 'main' }] : [],
    tagNames: [],
  };
  const transfer = new RemoteTransferService(runner, preferences);
  const transferContext = { ownerId: 1, generation: 0, ensureActive: () => {}, authorizePush: vi.fn(async () => {}) };
  const upload = async (publicationId: string) => {
    const record = store.get(repo, publicationId);
    const plan = await transfer.planPush(
      repo,
      { repoPath: repo, remoteNames: [selection.remoteName], branchTargets: record.branches, tagNames: record.tags.map((t) => t.name) },
      transferContext,
    );
    const batch = await transfer.executePush(repo, plan.id, transferContext);
    expect(batch.state, JSON.stringify(batch)).toBe('success');
    return plan;
  };
  return {
    root,
    repo,
    bare,
    initial,
    commit,
    service,
    makeService,
    selection,
    store,
    preferences,
    adapter,
    create,
    upload,
    transfer,
    transferContext,
    runner,
    setDefaultBranch,
    repository,
    setExisting: () => {
      existing = true;
    },
    changeAccount: () => {
      generation++;
    },
    changeRepo: () => {
      activePath = root;
      repoJobRegistry.cancelForRepoChange(root);
    },
  };
}

describe('guided repository publication with real Git', () => {
  it('creates an empty hosted repository, publishes multiple branches and explicit tags, then configures primary tracking', async () => {
    const f = fixture();
    git(f.repo, 'branch', 'feature');
    git(f.repo, 'tag', 'v1');
    git(f.repo, 'tag', 'not-selected');
    f.selection.branches.push({ sourceBranch: 'feature', destinationBranch: 'preview' });
    f.selection.tagNames = ['v1'];
    const plan = await f.service.prepare({ selection: f.selection });
    expect(plan.commitCount).toBe(1);
    const connected = await f.service.connect({ repoPath: f.repo, publicationId: plan.id });
    expect(connected.stage).toBe('connected');
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ initializeReadme: false, readmeContent: undefined }));
    await f.upload(plan.id);
    const complete = await f.service.finish({ repoPath: f.repo, publicationId: plan.id });
    expect(complete.stage).toBe('complete');
    expect(git(f.bare, 'rev-parse', 'refs/heads/main')).toBe(f.initial);
    expect(git(f.bare, 'rev-parse', 'refs/heads/preview')).toBe(f.initial);
    expect(git(f.bare, 'tag')).toBe('v1');
    expect(git(f.repo, 'config', 'branch.main.remote')).toBe('origin');
    expect(git(f.repo, 'config', 'branch.main.pushRemote')).toBe('origin');
    expect(git(f.repo, 'config', 'remote.pushDefault')).toBe('origin');
    expect(git(f.repo, 'config', 'branch.feature.merge')).toBe('refs/heads/preview');
    expect(f.preferences.read(f.repo)).toMatchObject({
      hostingRemote: 'origin',
      fetchRemote: 'origin',
      pullRemote: 'origin',
      pushRemotes: ['origin'],
      selectionModes: { push: 'remember', pull: 'remember', fetch: 'remember' },
    });
    expect(f.setDefaultBranch).toHaveBeenCalledWith(f.repository().ref, 'main');
  }, 30_000);
  it('adds a separate endpoint and preserves every existing default, push URL and upstream', async () => {
    const f = fixture();
    git(f.repo, 'remote', 'add', 'origin', 'https://other.invalid/team/backup.git');
    git(f.repo, 'config', 'branch.main.remote', 'origin');
    git(f.repo, 'config', 'branch.main.merge', 'refs/heads/main');
    git(f.repo, 'config', 'branch.main.pushRemote', 'origin');
    git(f.repo, 'config', 'remote.pushDefault', 'origin');
    git(f.repo, 'config', '--add', 'remote.origin.pushurl', 'https://backup.invalid/team/project.git');
    f.preferences.write(f.repo, {
      fetchRemote: 'origin',
      pullRemote: 'origin',
      pushRemotes: ['origin'],
      selectionModes: { push: 'ask' },
      profiles: [{ id: 'backup', name: 'Backup', remoteNames: ['origin'] }],
    });
    f.selection.remoteName = 'github';
    const prepared = await f.service.prepare({ selection: f.selection });
    await f.service.connect({ repoPath: f.repo, publicationId: prepared.id });
    await f.upload(prepared.id);
    await f.service.finish({ repoPath: f.repo, publicationId: prepared.id });
    expect(git(f.repo, 'config', 'branch.main.remote')).toBe('origin');
    expect(git(f.repo, 'config', 'remote.pushDefault')).toBe('origin');
    expect(git(f.repo, 'remote', 'get-url', '--push', 'origin')).toBe('https://backup.invalid/team/project.git');
    expect(f.preferences.read(f.repo)).toMatchObject({
      fetchRemote: 'origin',
      pullRemote: 'origin',
      pushRemotes: ['origin'],
      selectionModes: { push: 'ask' },
      profiles: [{ id: 'backup' }],
    });
  }, 30_000);
  it('connects an unborn repository and resumes after the first commit without creating again', async () => {
    const f = fixture(true);
    const prepared = await f.service.prepare({ selection: f.selection });
    await f.service.connect({ repoPath: f.repo, publicationId: prepared.id });
    expect((await f.service.finish({ repoPath: f.repo, publicationId: prepared.id })).stage).toBe('connected');
    const oid = f.commit('first commit');
    f.selection.branches = [{ sourceBranch: 'main', destinationBranch: 'main' }];
    await f.makeService().prepare({ selection: f.selection, publicationId: prepared.id });
    await f.makeService().connect({ repoPath: f.repo, publicationId: prepared.id });
    await f.upload(prepared.id);
    expect((await f.makeService().finish({ repoPath: f.repo, publicationId: prepared.id })).stage).toBe('complete');
    expect(git(f.bare, 'rev-parse', 'main')).toBe(oid);
    expect(f.create).toHaveBeenCalledTimes(1);
  }, 30_000);
  it('resumes setup after upload without recreating or pushing to a backup', async () => {
    const f = fixture();
    const prepared = await f.service.prepare({ selection: f.selection });
    await f.service.connect({ repoPath: f.repo, publicationId: prepared.id });
    await f.upload(prepared.id);
    f.setDefaultBranch.mockRejectedValueOnce(new Error('Server temporarily unavailable'));
    await expect(f.service.finish({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow('temporarily');
    expect(f.store.get(f.repo, prepared.id).stage).toBe('setup-pending');
    expect((await f.makeService().finish({ repoPath: f.repo, publicationId: prepared.id })).stage).toBe('complete');
    expect(f.create).toHaveBeenCalledTimes(1);
  }, 30_000);
  it('does not assign tracking when the published branch changes during final server setup', async () => {
    const f = fixture();
    const prepared = await f.service.prepare({ selection: f.selection });
    await f.service.connect({ repoPath: f.repo, publicationId: prepared.id });
    await f.upload(prepared.id);
    const competing = git(f.repo, 'commit-tree', `${f.initial}^{tree}`, '-p', f.initial, '-m', 'server advance');
    git(f.bare, 'fetch', f.repo, competing);
    f.setDefaultBranch.mockImplementationOnce(async () => {
      git(f.bare, 'update-ref', 'refs/heads/main', competing);
    });
    await expect(f.service.finish({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow('changed at the endpoint');
    expect(f.store.get(f.repo, prepared.id).stage).toBe('setup-pending');
    expect(git(f.repo, 'config', '--local', '--list')).not.toContain('branch.main.remote=');
    expect(f.create).toHaveBeenCalledTimes(1);
  }, 30_000);
  it('does not adopt an existing name, overwrite a remote or initialize a competing history', async () => {
    const f = fixture();
    f.setExisting();
    const prepared = await f.service.prepare({ selection: f.selection });
    await expect(f.service.connect({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow('already exists');
    expect(f.create).not.toHaveBeenCalled();
    expect(git(f.repo, 'remote')).toBe('');
    git(f.repo, 'remote', 'add', 'origin', 'https://original.invalid/repo.git');
    await expect(f.service.prepare({ selection: f.selection })).rejects.toThrow('already exists');
  }, 20_000);
  it('keeps an uncertain create across restart and requires explicit confirmation of the inspected candidate', async () => {
    const f = fixture();
    f.create.mockImplementationOnce(async () => {
      f.setExisting();
      throw new Error('Network connection lost');
    });
    const prepared = await f.service.prepare({ selection: f.selection });
    await expect(f.service.connect({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow('lost');
    const uncertain = await f.makeService().connect({ repoPath: f.repo, publicationId: prepared.id });
    expect(uncertain).toMatchObject({ stage: 'uncertain', candidate: { ref: { repositoryId: '51' } } });
    expect(git(f.repo, 'remote')).toBe('');
    expect((await f.makeService().connect({ repoPath: f.repo, publicationId: prepared.id, confirmCandidate: true })).stage).toBe('connected');
    expect(f.create).toHaveBeenCalledTimes(1);
  }, 20_000);
  it('requires another explicit confirmation when an uncertain creation candidate is replaced at the same name', async () => {
    const f = fixture();
    f.create.mockImplementationOnce(async () => {
      f.setExisting();
      throw new Error('Unknown creation outcome');
    });
    const prepared = await f.service.prepare({ selection: f.selection });
    await expect(f.service.connect({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow('Unknown');
    const first = await f.service.connect({ repoPath: f.repo, publicationId: prepared.id });
    expect(first.candidate?.ref.repositoryId).toBe('51');
    vi.mocked(f.adapter.repository).mockResolvedValue({ ...f.repository(), ref: { ...f.repository().ref, repositoryId: 'another-repository' } });
    const changed = await f.service.connect({ repoPath: f.repo, publicationId: prepared.id, confirmCandidate: true });
    expect(changed.stage).toBe('uncertain');
    expect(changed.candidate?.ref.repositoryId).toBe('another-repository');
    expect(git(f.repo, 'remote')).toBe('');
    expect(f.create).toHaveBeenCalledTimes(1);
  }, 20_000);
  it.each(['branch', 'remote', 'account', 'repository'] as const)(
    'stops after creation when the %s context changes',
    async (kind) => {
      const f = fixture();
      const prepared = await f.service.prepare({ selection: f.selection });
      f.create.mockImplementationOnce(async () => {
        f.setExisting();
        if (kind === 'branch') f.commit('changed');
        if (kind === 'remote') git(f.repo, 'remote', 'add', 'intruder', 'https://other.invalid/x.git');
        if (kind === 'account') f.changeAccount();
        if (kind === 'repository') f.changeRepo();
        return f.repository();
      });
      await expect(f.service.connect({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow(/changed|active repository/i);
      expect(f.store.get(f.repo, prepared.id).stage).toBe('created');
      expect(git(f.repo, 'remote')).not.toContain('origin');
    },
    20_000,
  );
  it('prevents double clicks and preserves a completed create when cancelled', async () => {
    const f = fixture();
    const prepared = await f.service.prepare({ selection: f.selection });
    let finish!: () => void;
    let enteredResolve!: () => void;
    const entered = {
      promise: new Promise<void>((resolve) => {
        enteredResolve = resolve;
      }),
      resolve: () => enteredResolve(),
    };
    f.create.mockImplementationOnce(async () => {
      entered.resolve();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      f.setExisting();
      return f.repository();
    });
    const pending = f.service.connect({ repoPath: f.repo, publicationId: prepared.id });
    await entered.promise;
    await expect(f.service.connect({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow('already running');
    f.service.cancel(f.repo);
    finish();
    await expect(pending).rejects.toThrow('cancelled');
    expect(f.store.get(f.repo, prepared.id).stage).toBe('created');
    expect(git(f.repo, 'remote')).toBe('');
  }, 20_000);
  it('requires a selected local branch for detached HEAD and ignores uncommitted files', async () => {
    const f = fixture();
    git(f.repo, 'checkout', '--detach');
    fs.writeFileSync(path.join(f.repo, 'uncommitted.txt'), 'not uploaded');
    await expect(f.service.prepare({ selection: { ...f.selection, branches: [] } })).rejects.toThrow('Choose a local branch');
    const prepared = await f.service.prepare({ selection: f.selection });
    expect(prepared.branches[0].sourceOid).toBe(f.initial);
    expect((await f.service.context({ repoPath: f.repo })).dirtyFiles).toBe(1);
  }, 20_000);
  it('preserves successful refs and retries only the rejected branch in a multi-ref upload', async () => {
    const f = fixture();
    git(f.repo, 'branch', 'feature');
    git(f.repo, 'tag', 'v1');
    f.selection.branches.push({ sourceBranch: 'feature', destinationBranch: 'preview' });
    f.selection.tagNames = ['v1'];
    const prepared = await f.service.prepare({ selection: f.selection });
    await f.service.connect({ repoPath: f.repo, publicationId: prepared.id });
    const competing = git(f.repo, 'commit-tree', `${f.initial}^{tree}`, '-p', f.initial, '-m', 'concurrent server commit');
    git(f.bare, 'fetch', f.repo, competing);
    git(f.bare, 'update-ref', 'refs/heads/preview', competing);
    const plan = await f.transfer.planPush(
      f.repo,
      { repoPath: f.repo, remoteNames: ['origin'], branchTargets: f.selection.branches, tagNames: ['v1'] },
      f.transferContext,
    );
    const partial = await f.transfer.executePush(f.repo, plan.id, f.transferContext);
    expect(partial.state).toBe('partial');
    expect(partial.targets[0].refResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ destinationRef: 'refs/heads/main', status: 'success' }),
        expect.objectContaining({ destinationRef: 'refs/heads/preview', status: 'rejected' }),
        expect.objectContaining({ destinationRef: 'refs/tags/v1', status: 'success' }),
      ]),
    );
    await expect(f.service.finish({ repoPath: f.repo, publicationId: prepared.id })).rejects.toThrow('not fully confirmed');
    expect(f.setDefaultBranch).not.toHaveBeenCalled();
    git(f.bare, 'update-ref', '-d', 'refs/heads/preview');
    vi.mocked(f.runner.runResult).mockClear();
    const retried = await f.transfer.retryPush(f.repo, partial.id, undefined, f.transferContext);
    expect(retried.state).toBe('success');
    const pushes = vi.mocked(f.runner.runResult).mock.calls.filter(([, args]) => args[0] === 'push');
    expect(pushes).toHaveLength(1);
    expect(pushes[0][1].filter((arg) => arg.includes(':refs/'))).toEqual([`${f.initial}:refs/heads/preview`]);
    expect((await f.service.finish({ repoPath: f.repo, publicationId: prepared.id })).stage).toBe('complete');
    expect(f.create).toHaveBeenCalledTimes(1);
  }, 40_000);
});
