import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSettings, readSettingsWithMigration, writeSettings } from '../settingsStore';
import { repositorySecretScanAllowlistService, secretScanAllowlistMigration } from '../repositorySecretScanAllowlist';
import { SECRET_SCAN_ALLOWLIST_PATH } from '../../../src/types/repositorySecretScanAllowlist';

const state = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => state.userData } }));
vi.mock('../secureStore', () => ({
  normalizeGeminiApiKey: () => '',
  readSavedGeminiApiKey: () => '',
  readSavedOpenAiApiKey: () => '',
  saveGeminiApiKeySecurely: () => true,
}));
vi.mock('../../git/GitRunner', () => ({
  GitRunner: class {
    async run() {
      return 'docs/example.env\0';
    }
  },
}));

let root: string;
let first: string;
let second: string;
const settingsPath = () => path.join(state.userData, 'settings.json');
const journalPath = () => path.join(state.userData, 'secret-scan-allowlist-migration.json');
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-settings-allowlist-'));
  state.userData = path.join(root, 'app');
  first = path.join(root, 'first');
  second = path.join(root, 'second');
  for (const directory of [state.userData, first, second]) fs.mkdirSync(directory);
  fs.writeFileSync(path.join(state.userData, 'repos.json'), JSON.stringify({ repos: [{ path: first }, { path: second }], activeRepo: first }));
  fs.writeFileSync(settingsPath(), JSON.stringify({ language: 'de', secretScanAllowlist: 'path:docs/example.env\nplain-dummy\nregex:.*\npath:not-here' }));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('durable migration of the former global allowlist', () => {
  it('journals known repositories before removing the global property, then copies only matching paths', async () => {
    const settings = readSettingsWithMigration();
    expect(settings.language).toBe('de');
    expect(settings).not.toHaveProperty('secretScanAllowlist');
    expect(readJson(settingsPath())).not.toHaveProperty('secretScanAllowlist');
    expect(readJson(journalPath())).toMatchObject({ version: 1, rules: ['docs/example.env', 'not-here'], discardedRules: 2 });
    expect(fs.existsSync(path.join(first, SECRET_SCAN_ALLOWLIST_PATH))).toBe(false);
    expect((await repositorySecretScanAllowlistService.prepare(first)).text).toBe('path:docs/example.env\n');
    expect((await repositorySecretScanAllowlistService.prepare(second)).text).toBe('path:docs/example.env\n');
    expect(secretScanAllowlistMigration.consumeReport(first)).toEqual({ importedRules: 1, discardedRules: 3, preservedExisting: false });
    expect(readJson(journalPath()).rules).toEqual([]);
  });
  it('captures migration input when settings are saved before any scan or editor opens', () => {
    writeSettings(readSettings());
    const original = readJson(journalPath());
    readSettingsWithMigration();
    expect(readJson(journalPath())).toEqual(original);
    expect(readJson(settingsPath())).not.toHaveProperty('secretScanAllowlist');
  });
  it('retains the original settings if the existing migration journal is corrupt', () => {
    const original = fs.readFileSync(settingsPath(), 'utf8');
    fs.writeFileSync(journalPath(), '{ invalid');
    expect(() => readSettingsWithMigration()).toThrow();
    expect(fs.readFileSync(settingsPath(), 'utf8')).toBe(original);
  });
});
