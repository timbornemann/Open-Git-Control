import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositoryPathKey } from '../../main-process/activeRepositoryAuthorization';
import { RemotePreferencesStore } from '../RemotePreferencesStore';
import { rememberRemoteTransferSelection, resolveRemoteTransferSelection } from '../../../src/shared/git/remoteTransferSelection';
import type { GitRemoteSnapshotDto, PullStrategy, RemotePreferences } from '../../../src/types/remoteTransfers';

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }));

describe('versioned remote preferences', () => {
  let directory: string;
  let filePath: string;
  let store: RemotePreferencesStore;
  const repoPath = path.resolve('workspace');
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-remote-preferences-'));
    filePath = path.join(directory, 'repository-remotes.json');
    store = new RemotePreferencesStore(() => filePath);
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('migrates version one atomically and preserves old profiles, sources and account identities as suggestions', () => {
    const preferences: RemotePreferences = {
      fetchRemote: 'origin',
      pushRemotes: ['origin', 'backup'],
      hostingRemote: 'origin',
      hostingRepository: { connectionId: 'account', repositoryId: '1', fullPath: 'team/repo' },
      profiles: [{ id: 'backup', name: 'Backup', remoteNames: ['origin', 'backup'], targetBranches: { backup: 'archive' }, tagNames: ['v1'] }],
      activeProfileId: 'backup',
      bindings: [
        { remoteName: 'origin', url: 'https://host.test/team/repo.git', repository: { connectionId: 'account', repositoryId: '1', fullPath: 'team/repo' } },
      ],
    };
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, repositories: { [repositoryPathKey(repoPath)]: preferences } }));
    expect(store.read(repoPath)).toEqual(preferences);
    const migrated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(migrated.version).toBe(2);
    expect(migrated.repositories[repositoryPathKey(repoPath)]).not.toHaveProperty('selectionModes');
    expect(fs.readdirSync(directory)).toEqual(['repository-remotes.json']);
    const serialized = fs.readFileSync(filePath, 'utf8');
    expect(store.read(repoPath)).toEqual(preferences);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(serialized);
  });

  it('keeps action decisions and identity snapshots valid after restarting the store', () => {
    const snapshot: GitRemoteSnapshotDto = {
      repoPath,
      branch: 'main',
      upstream: null,
      defaultPushRemote: 'origin',
      supportsPushUrlIsolation: true,
      remotes: ['origin', 'backup'].map((name) => ({
        name,
        fetchUrls: [`https://${name}.test/team/repo.git`],
        pushUrls: [`https://${name}.test/team/repo.git`],
      })),
    };
    const preferences = rememberRemoteTransferSelection(
      'push',
      snapshot,
      {},
      {
        selectedRemoteNames: ['origin', 'backup'],
        targetBranches: { origin: 'main', backup: 'archive' },
      },
      'remember',
    );
    store.write(repoPath, preferences);
    const restarted = new RemotePreferencesStore(() => filePath);
    expect(resolveRemoteTransferSelection('push', snapshot, restarted.read(repoPath))).toMatchObject({ state: 'ready', reason: 'remembered' });
    expect(resolveRemoteTransferSelection('fetch', snapshot, restarted.read(repoPath))).toMatchObject({ state: 'choose', reason: 'first-choice' });
    expect(restarted.read(path.join(directory, 'another'))).toEqual({});
  });

  it('preserves malformed or unsupported stores instead of overwriting user configuration', () => {
    for (const contents of [
      '{bad-json',
      JSON.stringify({ version: 3, repositories: {} }),
      JSON.stringify({ version: 1, repositories: { bad: { fetchRemote: '-unsafe' } } }),
    ]) {
      fs.writeFileSync(filePath, contents);
      expect(() => store.read(repoPath)).toThrow('The existing file was preserved');
      expect(fs.readFileSync(filePath, 'utf8')).toBe(contents);
    }
  });

  it('does not write invalid new preferences or create a store until settings are saved', () => {
    expect(store.read(repoPath)).toEqual({});
    expect(fs.existsSync(filePath)).toBe(false);
    expect(() => store.write(repoPath, { selectionModes: { push: 'invalid' as never } })).toThrow('Invalid transfer selection mode');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it.each<PullStrategy>(['default', 'rebase', 'merge', 'ff-only'])('persists %s only for the selected repository across restarts', (pullStrategy) => {
    store.write(repoPath, { pullRemote: 'origin', pullBranches: { main: 'release' }, pullStrategy });
    const restarted = new RemotePreferencesStore(() => filePath);
    expect(restarted.read(repoPath)).toEqual({ pullRemote: 'origin', pullBranches: { main: 'release' }, pullStrategy });
    expect(restarted.read(path.join(directory, 'other')).pullStrategy).toBeUndefined();
    const contents = fs.readFileSync(filePath, 'utf8');
    expect(() => store.write(repoPath, { pullStrategy: 'no-ff' as never })).toThrow('Invalid pull strategy');
    expect(fs.readFileSync(filePath, 'utf8')).toBe(contents);
  });

  it.each([1, 2])('keeps Git defaults for existing version %s repositories', (version) => {
    fs.writeFileSync(filePath, JSON.stringify({ version, repositories: { [repositoryPathKey(repoPath)]: { pullRemote: 'origin' } } }));
    expect(store.read(repoPath)).toEqual({ pullRemote: 'origin' });
    store.write(repoPath, store.read(repoPath));
    expect(new RemotePreferencesStore(() => filePath).read(repoPath).pullStrategy).toBeUndefined();
  });
});
