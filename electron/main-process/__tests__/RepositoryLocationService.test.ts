import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../../GitService';
import { RemotePreferencesStore } from '../../git/RemotePreferencesStore';
import { RepositoryPublicationStore, type StoredPublication } from '../../hosting/RepositoryPublicationStore';
import { RepositoryLocationService } from '../RepositoryLocationService';
import { readStoreData, writeStoreData } from '../repoStore';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
import { serializeRepositoryPlanningFile, readRepositoryPlanningFile } from '../repositoryPlanningFile';
import { readProjectPlannerData, type ProjectPlannerData } from '../projectPlannerStore';
import * as atomicFile from '../atomicFile';

const state = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => state.directory } }));
let fixture: string, oldPath: string, newPath: string, service: RepositoryLocationService;
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const json = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};
const project: ProjectPlannerData = {
  version: 1,
  projects: [{ id: 'project', name: 'Moved project', description: 'Keep me', kind: 'repository', repoPath: null, createdAt: 1, updatedAt: 1 }],
  items: [
    {
      id: 'todo',
      projectId: 'project',
      title: 'Keep the plan',
      description: 'Details',
      status: 'planned',
      priority: 'high',
      tags: ['test'],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-relocate-'));
  state.directory = path.join(fixture, 'app-data');
  const original = path.join(fixture, 'original');
  fs.mkdirSync(original);
  git(original, 'init', '-b', 'main');
  oldPath = path.resolve(git(original, 'rev-parse', '--show-toplevel'));
  newPath = path.join(path.dirname(oldPath), 'moved');
  writeStoreData({ repos: [{ path: oldPath, pinned: true, createdAt: 17, lastOpened: 23 }], activeRepo: oldPath, sortBy: 'nameDesc' });
  service = new RepositoryLocationService(new GitService().runner);
});
afterEach(() => {
  vi.restoreAllMocks();
  // Only remove the specifically created fixture, never a computed repository root.
  if (!path.basename(fixture).startsWith('ogc-relocate-')) throw new Error('Unexpected fixture path.');
  fs.rmSync(fixture, { recursive: true, force: true });
});
const move = () => fs.renameSync(oldPath, newPath);

describe('saved repository relocation with real Git', () => {
  it('preserves metadata, remote accounts/profiles, local planning IDs, run settings, icons and pending publication records', async () => {
    const preferences = {
      hostingRemote: 'backup',
      fetchRemote: 'origin',
      pullRemote: 'origin',
      pushRemotes: ['origin', 'backup'],
      profiles: [{ id: 'all', name: 'All targets', remoteNames: ['origin', 'backup'] }],
      activeProfileId: 'all',
      bindings: [
        {
          remoteName: 'origin',
          url: 'https://github.com/me/project.git',
          repository: { connectionId: 'account', repositoryId: '123', fullPath: 'me/project' },
        },
      ],
      selectionModes: { push: 'remember' as const },
    };
    new RemotePreferencesStore().write(oldPath, preferences);
    const planning = path.join(oldPath, '.Open-Git-Control', 'planning.json');
    fs.mkdirSync(path.dirname(planning));
    const planningText = serializeRepositoryPlanningFile(project);
    fs.writeFileSync(planning, planningText);
    fs.writeFileSync(path.join(path.dirname(planning), 'run.json'), '{"custom":"run settings"}');
    // Populate the planner's in-memory association before moving it.
    expect(readProjectPlannerData().items).toHaveLength(1);
    const iconFile = (repo: string) =>
      path.join(state.directory, 'repository-icons', `${createHash('sha256').update(repositoryPathKey(repo)).digest('hex')}.json`);
    json(iconFile(oldPath), { version: 1, repoPath: oldPath, mode: 'manual', manualPath: 'logo.png', thumbnail: { dataUrl: 'preview' } });
    new RepositoryPublicationStore().save({
      id: 'pending',
      selection: { repoPath: oldPath },
      accountKey: 'account',
      gitDirectory: path.join(oldPath, '.git'),
      branches: [],
      stage: 'created',
      fingerprint: 'unchanged',
    } as unknown as StoredPublication);
    move();
    fs.mkdirSync(path.join(newPath, 'nested'));
    expect(await service.relocate(oldPath, path.join(newPath, 'nested'), vi.fn())).toBe(newPath);
    expect(readStoreData()).toEqual({ repos: [{ path: newPath, pinned: true, createdAt: 17, lastOpened: 23 }], activeRepo: newPath, sortBy: 'nameDesc' });
    expect(new RemotePreferencesStore().read(newPath)).toEqual(preferences);
    expect(new RemotePreferencesStore().read(oldPath)).toEqual({});
    expect(fs.readFileSync(path.join(newPath, '.Open-Git-Control', 'planning.json'), 'utf8')).toBe(planningText);
    expect(readProjectPlannerData()).toMatchObject({ projects: [{ id: 'project', repoPath: newPath }], items: [{ id: 'todo' }] });
    expect(fs.readFileSync(path.join(newPath, '.Open-Git-Control', 'run.json'), 'utf8')).toBe('{"custom":"run settings"}');
    expect(JSON.parse(fs.readFileSync(iconFile(newPath), 'utf8'))).toMatchObject({
      repoPath: newPath,
      mode: 'manual',
      manualPath: 'logo.png',
      thumbnail: { dataUrl: 'preview' },
    });
    expect(new RepositoryPublicationStore().get(newPath, 'pending')).toMatchObject({
      id: 'pending',
      gitDirectory: path.join(newPath, '.git'),
      fingerprint: 'unchanged',
      stage: 'created',
    });
  });

  it('rechecks a remounted repository without changing its metadata or planning file', async () => {
    move();
    await expect(service.recheck(oldPath, vi.fn())).rejects.toThrow();
    fs.renameSync(newPath, oldPath);
    const before = fs.readFileSync(path.join(state.directory, 'repos.json'), 'utf8');
    expect(await service.recheck(oldPath, vi.fn())).toBe(oldPath);
    expect(await service.relocate(oldPath, oldPath, vi.fn())).toBe(oldPath);
    expect(fs.readFileSync(path.join(state.directory, 'repos.json'), 'utf8')).toBe(before);
  });

  it('reassociates legacy planning data without losing project or todo identities', async () => {
    json(path.join(state.directory, 'project-planner.json'), { ...project, projects: [{ ...project.projects[0], repoPath: oldPath }] });
    move();
    await service.relocate(oldPath, newPath, vi.fn());
    const legacy = JSON.parse(fs.readFileSync(path.join(state.directory, 'project-planner.json'), 'utf8'));
    expect(legacy.projects[0]).toMatchObject({ id: 'project', repoPath: newPath });
    expect(legacy.items[0].id).toBe('todo');
    expect(readProjectPlannerData()).toMatchObject({ projects: [{ id: 'project', repoPath: newPath }], items: [{ id: 'todo' }] });
  });

  it('keeps both saved repositories and their settings when the selected target is already registered', async () => {
    move();
    writeStoreData({
      repos: [...readStoreData().repos, { path: newPath, pinned: false, createdAt: 29, lastOpened: 31 }],
      activeRepo: oldPath,
      sortBy: 'nameAsc',
    });
    const before = fs.readFileSync(path.join(state.directory, 'repos.json'), 'utf8');
    await expect(service.relocate(oldPath, newPath, vi.fn())).rejects.toThrow('already in your list');
    expect(fs.readFileSync(path.join(state.directory, 'repos.json'), 'utf8')).toBe(before);
  });

  it('rejects non-Git folders and a healthy original without modifying saved data', async () => {
    fs.mkdirSync(newPath);
    const before = readStoreData();
    await expect(service.relocate(oldPath, newPath, vi.fn())).rejects.toThrow();
    git(newPath, 'init');
    await expect(service.relocate(oldPath, newPath, vi.fn())).rejects.toThrow('original repository is available');
    expect(readStoreData()).toEqual(before);
  });

  it('stops a stale operation before any writes and refuses an entry removed during validation', async () => {
    move();
    const before = readStoreData();
    const current = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new Error('Repository switched');
      });
    await expect(service.relocate(oldPath, newPath, current)).rejects.toThrow('Repository switched');
    expect(readStoreData()).toEqual(before);
    await expect(service.relocate(oldPath, newPath, () => writeStoreData({ ...before, repos: [] }))).rejects.toThrow('saved repository changed');
  });

  it('rolls back our settings writes if publishing the new saved path fails', async () => {
    new RemotePreferencesStore().write(oldPath, { pushRemotes: ['origin'] });
    const remoteFile = path.join(state.directory, 'repository-remotes.json');
    const before = fs.readFileSync(remoteFile, 'utf8');
    const originalWriter = atomicFile.writeTextFileAtomically;
    vi.spyOn(atomicFile, 'writeTextFileAtomically').mockImplementation((file, contents) => {
      if (path.basename(file) === 'repos.json') throw new Error('Disk full');
      originalWriter(file, contents);
    });
    move();
    await expect(service.relocate(oldPath, newPath, vi.fn())).rejects.toThrow('Disk full');
    expect(readStoreData().activeRepo).toBe(oldPath);
    expect(fs.readFileSync(remoteFile, 'utf8')).toBe(before);
  });

  it('refuses to relocate corrupt authoritative settings, leaving the original files intact', async () => {
    fs.writeFileSync(path.join(state.directory, 'repository-remotes.json'), '{invalid');
    move();
    await expect(service.relocate(oldPath, newPath, vi.fn())).rejects.toThrow();
    expect(readStoreData().activeRepo).toBe(oldPath);
    expect(fs.readFileSync(path.join(state.directory, 'repository-remotes.json'), 'utf8')).toBe('{invalid');
  });

  it('accepts a moved bare repository and does not require a first commit', async () => {
    move();
    const bare = path.join(path.dirname(oldPath), 'bare.git');
    fs.mkdirSync(bare);
    git(bare, 'init', '--bare');
    const canonical = path.resolve(git(bare, 'rev-parse', '--absolute-git-dir'));
    expect(await service.relocate(oldPath, bare, vi.fn())).toBe(canonical);
    expect(readStoreData().repos[0].path).toBe(canonical);
    expect(readRepositoryPlanningFile(path.join(canonical, '.Open-Git-Control', 'planning.json'), canonical).projects).toEqual([]);
  });
});
