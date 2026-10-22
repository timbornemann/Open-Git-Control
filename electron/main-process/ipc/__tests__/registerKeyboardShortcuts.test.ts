import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRepoSettingsHandlers } from '../registerRepoSettingsHandlers';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { AppSettings } from '../../../settings';

const state = vi.hoisted(() => ({ userData: '', handlers: new Map<string, (...args: any[]) => Promise<AppSettings>>() }));
vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  ipcMain: { handle: (id: string, handler: (...args: any[]) => Promise<AppSettings>) => state.handlers.set(id, handler) },
}));
vi.mock('../../repoStore', () => ({ readStoreData: vi.fn(), writeStoreData: vi.fn(), mutateRepositoryStore: vi.fn() }));
vi.mock('../../githubCatalogCache', () => ({ clearGithubCatalogCache: vi.fn() }));
vi.mock('../../secureStore', () => ({
  clearSavedGeminiApiKeySecurely: vi.fn(),
  clearSavedGithubTokenSecurely: vi.fn(),
  clearSavedOpenAiApiKeySecurely: vi.fn(),
  normalizeGeminiApiKey: () => '',
  normalizeOpenAiApiKey: () => '',
  readSavedGeminiApiKey: () => '',
  readSavedOpenAiApiKey: () => '',
  saveGeminiApiKeySecurely: () => true,
  saveOpenAiApiKeySecurely: () => true,
}));
const stored = () => fs.readFileSync(path.join(state.userData, 'settings.json'), 'utf8');
const get = () => state.handlers.get(IpcChannel.SettingsGet)!({});
const set = (partial: Partial<AppSettings>) => state.handlers.get(IpcChannel.SettingsSet)!({}, partial);
beforeEach(() => {
  state.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-shortcut-settings-'));
  fs.writeFileSync(path.join(state.userData, 'settings.json'), JSON.stringify({ language: 'de' }));
  registerRepoSettingsHandlers({ updaterManager: {} as never, githubService: { logout: vi.fn() } });
});
afterEach(() => {
  fs.rmSync(state.userData, { recursive: true, force: true });
  state.handlers.clear();
});
describe('keyboard shortcut settings persistence', () => {
  it('loads old settings with defaults, persists changes and reloads them without an in-memory cache', async () => {
    expect((await get()).keyboardShortcuts).toEqual({});
    const keyboardShortcuts = { fetch: { key: 'K', primary: true, shift: true, alt: false }, saveFile: null };
    const result = await set({ keyboardShortcuts });
    expect(result.keyboardShortcuts?.fetch?.key).toBe('k');
    expect(JSON.parse(stored()).keyboardShortcuts).toEqual(result.keyboardShortcuts);
    expect((await get()).keyboardShortcuts).toEqual(result.keyboardShortcuts);
    await set({ keyboardShortcuts: {} });
    expect((await get()).keyboardShortcuts).toEqual({});
  });
  it('rejects conflicts and invalid entries before writing or changing any settings', async () => {
    const original = stored();
    for (const keyboardShortcuts of [
      { fetch: { key: 'p', primary: true, shift: true, alt: false } },
      { saveFile: { key: 'F12', primary: false, shift: false, alt: false } },
      { unknown: null },
    ]) {
      await expect(set({ language: 'en', keyboardShortcuts } as Partial<AppSettings>)).rejects.toThrow('Invalid or conflicting');
      expect(stored()).toBe(original);
    }
    expect((await get()).language).toBe('de');
  });
});
