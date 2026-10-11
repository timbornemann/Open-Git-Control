import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { maintenanceFixture } from './maintenanceFixture';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
const state = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => state.root } }));
import { readRepositoryUiPreferences, updateRepositoryUiPreferences } from '../repositoryUiPreferences';

describe('shared per-repository UI metadata', () => {
  let fixture: ReturnType<typeof maintenanceFixture>;
  beforeEach(() => {
    fixture = maintenanceFixture();
    state.root = fixture.root;
    fixture.file('repos.json', fixture.data);
  });
  afterEach(() => fixture.dispose());
  it('migrates supported legacy preferences once, merges targeted patches and rejects stale removed owners', () => {
    const key = repositoryPathKey(fixture.repo);
    expect(readRepositoryUiPreferences({ [fixture.repo]: { tagPanelCollapsed: true } })[key]).toEqual({ tagPanelCollapsed: true });
    expect(updateRepositoryUiPreferences({ repoPath: fixture.repo, patch: { branchPanelCollapsed: true } })[key]).toEqual({
      branchPanelCollapsed: true,
      tagPanelCollapsed: true,
    });
    expect(readRepositoryUiPreferences({ [fixture.repo]: { tagPanelCollapsed: false } })[key]?.tagPanelCollapsed).toBe(true);
    fixture.file('repos.json', { repos: [], activeRepo: null, sortBy: 'nameAsc' });
    expect(() => updateRepositoryUiPreferences({ repoPath: fixture.repo, patch: {} })).toThrow('no longer registered');
    expect(readRepositoryUiPreferences()[key]?.tagPanelCollapsed).toBe(true);
  });
  it('keeps orphan preferences for thirty observed days and preserves malformed or future formats', async () => {
    const orphan = path.join(fixture.directory, 'orphan'),
      key = repositoryPathKey(orphan);
    readRepositoryUiPreferences({ [orphan]: { branchPanelCollapsed: true } });
    await fixture.service.run({ mode: 'eligible' });
    fixture.advance(29);
    await fixture.service.run({ mode: 'eligible' });
    expect(readRepositoryUiPreferences()[key]).toBeDefined();
    fixture.advance(1);
    await fixture.service.run({ mode: 'eligible' });
    expect(readRepositoryUiPreferences()[key]).toBeUndefined();
    for (const content of ['{partial', '{"version":99,"repositories":{}}']) {
      const file = fixture.file('repository-ui-state.json', content);
      expect(() => readRepositoryUiPreferences()).toThrow();
      await fixture.service.run({ mode: 'all-caches' });
      expect(fs.readFileSync(file, 'utf8')).toBe(content);
    }
  });
  it('rejects unknown fields, paths and junctions without replacing settings', () => {
    expect(() => readRepositoryUiPreferences({ relative: {} })).toThrow('Unsupported');
    expect(() => readRepositoryUiPreferences({ [fixture.repo]: { future: true } })).toThrow('Unsupported');
    expect(() => updateRepositoryUiPreferences({ repoPath: fixture.repo, patch: { tagPanelCollapsed: 1 } } as never)).toThrow('Invalid');
    const outside = path.join(fixture.directory, 'outside.json');
    fs.writeFileSync(outside, 'protected');
    // A directory junction at the managed root is portable on Windows without symlink privileges.
    const redirected = path.join(fixture.directory, 'redirected');
    fs.mkdirSync(redirected);
    state.root = path.join(fixture.directory, 'alias');
    fs.symlinkSync(redirected, state.root, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => readRepositoryUiPreferences()).toThrow('Redirected');
    expect(fs.readFileSync(outside, 'utf8')).toBe('protected');
  });
});
