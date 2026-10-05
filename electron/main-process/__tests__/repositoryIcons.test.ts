import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepositoryIconService } from '../RepositoryIconService';
import { discoverRepositoryIcons, readRepositoryIconSource } from '../repositoryIconDiscovery';
import type { RepositoryIconStateDto } from '../../../src/shared/repositoryIcons';

const png = 'data:image/png;base64,thumbnail';
let root: string, repo: string, directory: string, stored: string[], now: number;
const service = () =>
  new RepositoryIconService({
    directory,
    storedPaths: () => stored,
    validatePng: (data) => {
      if (data !== png) throw new Error('Invalid PNG');
      return data;
    },
    now: () => now,
  });
function file(
  relative: string,
  content = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red" /></svg>',
  base = repo,
) {
  const target = path.join(base, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}
async function cache(api: RepositoryIconService, state: RepositoryIconStateDto, sourcePath = 'logo.svg') {
  const source = await api.readSource(repo, sourcePath);
  return api.cache(repo, {
    path: sourcePath,
    sourceVersion: source.version,
    selectionVersion: state.selectionVersion,
    expectedRevision: state.revision,
    dataUrl: png,
  });
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-icons-'));
  repo = path.join(root, 'repo');
  directory = path.join(root, 'icons');
  fs.mkdirSync(repo);
  stored = [repo];
  now = 1_000_000;
});
afterEach(() => {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-icons-')) throw new Error('Invalid cleanup path');
  fs.rmSync(root, { recursive: true, force: true });
});
describe('repository icon discovery', () => {
  it('ranks exact root names before asset names and substring matches, retaining build icons', async () => {
    [
      'assets/logo.svg',
      'logo.svg',
      'icon.svg',
      'build/app-icon.svg',
      'src/project-logo.svg',
      'docs/brand.svg',
      'photo.svg',
      'node_modules/pkg/icon.svg',
      '.git/logo.svg',
      'dist/logo.svg',
    ].forEach((name) => file(name));
    expect((await discoverRepositoryIcons(repo)).candidates).toEqual([
      'icon.svg',
      'logo.svg',
      'assets/logo.svg',
      'build/app-icon.svg',
      'src/project-logo.svg',
      'docs/brand.svg',
    ]);
  });
  it('finds mixed-case, Unicode, new and untracked image names without using Git', async () => {
    ['Logo.PNG', 'images/MyAppICON.webp', 'docs/标志-logo.svg', 'other/FAVICON.ico'].forEach((name) => file(name));
    const found = await discoverRepositoryIcons(repo);
    expect(found.candidates).toHaveLength(4);
    expect(found.candidates[0]).toBe('Logo.PNG');
    expect(found.limited).toBe(false);
  });
  it('bounds depth and entry counts and leaves explicit deeper selection usable', async () => {
    file('deep/nested/logo.svg');
    file('logo.svg');
    expect((await discoverRepositoryIcons(repo, { depth: 0, entries: 20_000 })).limited).toBe(true);
    expect((await discoverRepositoryIcons(repo, { depth: 8, entries: 1 })).limited).toBe(true);
    expect((await readRepositoryIconSource(repo, 'deep/nested/logo.svg')).dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it('rejects traversal and symlink/junction assets outside the repository', async () => {
    const outside = path.join(root, 'outside');
    file('logo.svg', 'external', outside);
    fs.symlinkSync(outside, path.join(repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    expect((await discoverRepositoryIcons(repo)).candidates).toEqual([]);
    await expect(readRepositoryIconSource(repo, 'linked/logo.svg')).rejects.toThrow();
    await expect(readRepositoryIconSource(repo, '../outside/logo.svg')).rejects.toThrow();
  });
  it('accepts this project’s large PNG and small ICO while refusing oversized SVG files', async () => {
    const own = path.resolve('.');
    expect((await readRepositoryIconSource(own, 'logo.png')).bytes).toBeGreaterThan(10 * 1024 * 1024);
    expect((await readRepositoryIconSource(own, 'logo.ico')).dataUrl).toMatch(/^data:image\/x-icon;base64,/);
    const target = file('logo.svg');
    fs.truncateSync(target, 2 * 1024 * 1024 + 1);
    await expect(readRepositoryIconSource(repo, 'logo.svg')).rejects.toThrow('too large');
  });
});
describe('persistent repository icon selection', () => {
  it('restores the small thumbnail after restart without copying the original image', async () => {
    file('logo.svg');
    const api = service();
    const state = await api.get(repo, true);
    await cache(api, state);
    const restored = await service().get(repo);
    expect(restored.thumbnail?.dataUrl).toBe(png);
    expect(fs.readFileSync(path.join(directory, fs.readdirSync(directory)[0]), 'utf8')).not.toContain('<svg');
  });
  it('isolates repositories with the same name and retains independent manual selections', async () => {
    const other = path.join(root, 'another', 'repo');
    fs.mkdirSync(other, { recursive: true });
    stored.push(other);
    file('logo.svg');
    file('custom.svg', 'other image', other);
    const api = service();
    const first = await api.get(repo, true),
      second = await api.get(other, true);
    await api.choose(other, { mode: 'manual', path: 'custom.svg', expectedSelectionVersion: second.selectionVersion });
    expect((await api.get(repo)).selectionVersion).toBe(first.selectionVersion);
    expect((await api.get(other)).manualPath).toBe('custom.svg');
    expect(fs.readdirSync(directory)).toHaveLength(2);
  });
  it('revalidates edited sources and preserves a deleted manual path with an initials fallback', async () => {
    const target = file('custom.svg');
    const api = service();
    const initial = await api.get(repo, true);
    const manual = await api.choose(repo, { mode: 'manual', path: 'custom.svg', expectedSelectionVersion: initial.selectionVersion });
    await cache(api, manual, 'custom.svg');
    fs.writeFileSync(target, 'changed contents');
    now += 60_001;
    expect((await api.get(repo, true)).thumbnail).toBeNull();
    fs.unlinkSync(target);
    const missing = await api.get(repo, true);
    expect(missing.mode).toBe('manual');
    expect(missing.manualPath).toBe('custom.svg');
    expect(missing.thumbnail).toBeNull();
    expect(missing.status).toBe('ready');
  });
  it('keeps the last icon while a repository is temporarily unavailable', async () => {
    file('logo.svg');
    const api = service();
    await cache(api, await api.get(repo, true));
    fs.renameSync(repo, path.join(root, 'temporarily-offline'));
    const result = await api.get(repo, true);
    expect(result.status).toBe('unavailable');
    expect(result.thumbnail?.dataUrl).toBe(png);
  });
  it('rejects a stale thumbnail after changing the preference or source contents', async () => {
    file('logo.svg');
    const api = service();
    const state = await api.get(repo, true),
      source = await api.readSource(repo, 'logo.svg');
    file('logo.svg', 'changed');
    const request = {
      path: 'logo.svg',
      sourceVersion: source.version,
      selectionVersion: state.selectionVersion,
      expectedRevision: state.revision,
      dataUrl: png,
    };
    await expect(api.cache(repo, request)).rejects.toThrow('changed');
    await api.choose(repo, { mode: 'initials', expectedSelectionVersion: state.selectionVersion });
    await expect(api.cache(repo, request)).rejects.toThrow('changed');
    await expect(api.choose(repo, { mode: 'auto', expectedSelectionVersion: state.selectionVersion })).rejects.toThrow('selection changed');
  });
  it('does not use arbitrary directories and rejects work completing after removal', async () => {
    file('logo.svg');
    const api = service();
    const state = await api.get(repo, true);
    await expect(api.get(root)).rejects.toThrow('saved repositories');
    stored = [];
    api.retainRepositories(stored);
    await expect(cache(api, state)).rejects.toThrow('saved repositories');
  });
  it('requires explicit absolute repository identity even when the current directory is saved', async () => {
    stored = [path.resolve('.')];
    const api = service();
    for (const invalid of ['', '.', path.relative('.', stored[0])]) await expect(api.get(invalid)).rejects.toThrow('absolute');
  });
  it('recovers from a corrupt cache and keeps the current preference if an atomic write fails', async () => {
    file('logo.svg');
    const api = service();
    await api.get(repo, true);
    fs.writeFileSync(path.join(directory, fs.readdirSync(directory)[0]), '{corrupt');
    const recovered = service();
    const initial = await recovered.get(repo, true);
    expect(initial.mode).toBe('auto');
    fs.renameSync(directory, `${directory}-previous`);
    fs.writeFileSync(directory, 'not a directory');
    await expect(recovered.choose(repo, { mode: 'initials', expectedSelectionVersion: initial.selectionVersion })).rejects.toThrow();
    expect((await recovered.get(repo)).mode).toBe('auto');
  });
  it('negative caches the search and discovers newly added icons after the scan interval', async () => {
    const api = service();
    expect((await api.get(repo, true)).candidates).toEqual([]);
    file('logo.svg');
    expect((await api.get(repo)).candidates).toEqual([]);
    now += 300_001;
    const updated = await api.get(repo, true);
    expect(updated.candidates).toEqual(['logo.svg']);
  });
});
