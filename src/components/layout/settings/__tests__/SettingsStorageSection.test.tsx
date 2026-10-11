// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { I18nProvider } from '@/i18n';
import { SettingsStorageSection } from '../SettingsStorageSection';
import type { StorageOverview } from '@/shared/ipc/storageMaintenance';

const api = vi.hoisted(() => ({ inspect: vi.fn(), run: vi.fn(), subscribe: vi.fn(), recovery: vi.fn(), removeRecovery: vi.fn(), restore: vi.fn() }));
vi.mock('@/services/storageClient', () => ({ storageClient: { ...api, isAvailable: () => true } }));

describe('storage settings and explicit actions', () => {
  let root: Root, container: HTMLDivElement, overview: StorageOverview;
  const update = vi.fn(async () => {});
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    overview = {
      checkedAt: 100,
      groups: [
        { category: 'previews', bytes: 1024 ** 2, files: 2, budget: 128 * 1024 ** 2, reclaimableBytes: 512 },
        { category: 'protected', bytes: 4096, files: 1, budget: null, reclaimableBytes: 0 },
      ],
      issues: [{ category: 'protected', path: 'credentials.bin', reason: 'open-recovery-operation' }],
      repositories: [],
      removedRepositories: [],
      reports: [],
    };
    api.inspect.mockResolvedValue({ success: true, data: overview });
    api.run.mockResolvedValue({ success: true, data: overview });
    api.subscribe.mockReturnValue(() => {});
    api.recovery.mockResolvedValue({ success: true, data: [] });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = async (language: 'de' | 'en' = 'en') => {
    await act(async () =>
      root.render(
        createElement(
          I18nProvider,
          { language },
          createElement(SettingsStorageSection, { settings: { ...DEFAULT_SETTINGS, language }, onUpdateSettings: update, variant: 'main' }),
        ),
      ),
    );
  };
  const button = (text: string) => {
    const found = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === text);
    if (!found) throw new Error(`Missing action: ${text}`);
    return found;
  };
  it('shows actual storage and budgets, defaults to automatic care and sends fixed cleanup categories', async () => {
    await render();
    expect(container.textContent).toContain('1.0 MiB');
    expect(container.textContent).toContain('128.0 MiB');
    const toggle = container.querySelector<HTMLInputElement>('.settings-switch-input')!;
    expect(toggle.checked).toBe(true);
    await act(async () => toggle.click());
    expect(update).toHaveBeenCalledWith({ automaticMaintenanceEnabled: false });
    await act(async () => button('Run due cleanup').click());
    expect(api.run).toHaveBeenLastCalledWith({ mode: 'eligible' });
    await act(async () => button('Clear rebuildable caches').click());
    expect(api.run).toHaveBeenLastCalledWith({ mode: 'all-caches', categories: ['previews', 'analytics', 'statistics', 'http', 'code', 'auxiliary'] });
  });
  it('keeps checking available when damaged ownership blocks cleanup and ignores older events', async () => {
    overview.blockedReason = 'Repository registry unreadable';
    await render('de');
    expect(button('Fällige Bereinigung ausführen').disabled).toBe(true);
    expect(button('Wiederherstellbare Caches leeren').disabled).toBe(true);
    expect(button('Jetzt prüfen').disabled).toBe(false);
    const callback = api.subscribe.mock.lastCall?.[0];
    await act(async () => callback({ ...overview, checkedAt: 50, blockedReason: 'Older error' }));
    expect(container.textContent).toContain('Repository registry unreadable');
    expect(container.textContent).not.toContain('Older error');
  });
  it('requires selecting completed recovery records and forwards only selected IDs', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    api.recovery.mockResolvedValue({
      success: true,
      data: [{ repoPath: 'C:/repo/.git', id, createdAt: 1, reference: 'refs/ogc/commit-reword/1', objectId: 'a'.repeat(40) }],
    });
    api.removeRecovery.mockResolvedValue({ success: true, data: 0 }); // The main-process confirmation was cancelled.
    await render();
    await act(async () => button('Show completed operations').click());
    expect(button('Remove selected backups …').disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('.storage-recovery input')!.click());
    expect(button('Remove selected backups …').disabled).toBe(false);
    await act(async () => button('Remove selected backups …').click());
    expect(api.removeRecovery).toHaveBeenCalledWith({ repoPath: 'C:/repo/.git', ids: [id] });
    expect(container.querySelector<HTMLInputElement>('.storage-recovery input')!.checked).toBe(false);
  });
});
