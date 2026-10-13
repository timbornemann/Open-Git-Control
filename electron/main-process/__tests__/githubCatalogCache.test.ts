import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubRepositoryDto } from '../../../src/types/githubDtos';

const { getPathMock, encryptionAvailableMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
  encryptionAvailableMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: getPathMock },
  safeStorage: {
    encryptString: (value: string) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`),
    decryptString: (value: Buffer) => Buffer.from(value.toString().slice('encrypted:'.length), 'base64').toString(),
  },
}));
vi.mock('../secureStore', () => ({ isSecureStorageAvailable: encryptionAvailableMock }));

let directory: string;
const repo = (id: number, name: string, isPrivate: boolean): GitHubRepositoryDto => ({
  id,
  name,
  fullName: `alice/${name}`,
  private: isPrivate,
  cloneUrl: `https://github.com/alice/${name}.git`,
  htmlUrl: `https://github.com/alice/${name}`,
});

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-github-cache-'));
  getPathMock.mockReturnValue(directory);
  encryptionAvailableMock.mockReturnValue(true);
  vi.resetModules();
});
afterEach(async () => {
  await (await import('../githubCatalogCache')).clearGithubCatalogCache();
  if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('ogc-github-cache-'))
    throw new Error('Unsafe fixture');
  fs.rmSync(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('GitHub catalog snapshot', () => {
  it('persists private cards only through OS encryption and binds them to the account', async () => {
    const cache = await import('../githubCatalogCache');
    await cache.saveGithubCatalogCache('github.com', 'alice', [repo(1, 'public-demo', false), repo(2, 'private-secret', true)]);
    const file = fs.readFileSync(path.join(directory, 'github-catalog.json'), 'utf8');
    expect(file).toContain('public-demo');
    expect(file).not.toContain('private-secret');

    vi.resetModules();
    const afterRestart = await import('../githubCatalogCache');
    expect(afterRestart.readGithubCatalogCache('github.com', 'alice')?.repos).toHaveLength(2);
    expect(afterRestart.readGithubCatalogCache('github.com', 'alice')?.refreshRequired).toBe(false);
    expect(afterRestart.readGithubCatalogCache('github.com', 'bob')).toBeNull();
    await afterRestart.clearGithubCatalogCache();
    expect(fs.existsSync(path.join(directory, 'github-catalog.json'))).toBe(false);
  });

  it('keeps private cards only in session memory when secure storage is unavailable', async () => {
    encryptionAvailableMock.mockReturnValue(false);
    const cache = await import('../githubCatalogCache');
    await cache.saveGithubCatalogCache('ghe.example', 'alice', [repo(1, 'public-demo', false), repo(2, 'private-secret', true)]);
    expect(cache.readGithubCatalogCache('ghe.example', 'alice')?.repos).toHaveLength(2);
    expect(cache.readGithubCatalogCache('ghe.example', 'alice')?.refreshRequired).toBeUndefined();

    vi.resetModules();
    const afterRestart = await import('../githubCatalogCache');
    expect(afterRestart.readGithubCatalogCache('ghe.example', 'alice')?.repos.map((item) => item.name)).toEqual(['public-demo']);
    expect(afterRestart.readGithubCatalogCache('ghe.example', 'alice')?.refreshRequired).toBe(true);
    expect(afterRestart.readGithubCatalogCache('github.com', 'alice')).toBeNull();
  });

  it('refreshes an encrypted snapshot if OS decryption becomes unavailable', async () => {
    const cache = await import('../githubCatalogCache');
    await cache.saveGithubCatalogCache('github.com', 'alice', [repo(1, 'public-demo', false), repo(2, 'private-secret', true)]);

    encryptionAvailableMock.mockReturnValue(false);
    vi.resetModules();
    const afterRestart = await import('../githubCatalogCache');
    expect(afterRestart.readGithubCatalogCache('github.com', 'alice')?.repos.map((item) => item.name)).toEqual(['public-demo']);
    expect(afterRestart.readGithubCatalogCache('github.com', 'alice')?.refreshRequired).toBe(true);
  });
});
