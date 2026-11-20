// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { BranchBackupOverview, BranchBackupStatus } from '@/shared/ipc/branchRecovery';
import { BranchBackupSettings } from '../BranchBackupSettings';

const api = vi.hoisted(() => ({ isAvailable: vi.fn(), overview: vi.fn(), backupNow: vi.fn(), showToast: vi.fn() }));
vi.mock('@/services/branchRecoveryClient', () => ({ branchBackupClient: api }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => api.showToast }));

const directory = 'C:/Backup';
const repository: BranchBackupStatus = {
  repoPath: 'D:/Projects/Example',
  repositoryKey: 'example',
  registered: true,
  automatic: true,
  busy: false,
  checkedAt: null,
  verifiedAt: null,
  lastError: null,
  versions: [],
};

function showOverview(overrides: Partial<BranchBackupOverview> = {}) {
  api.overview.mockImplementation(async () => ({
    success: true,
    data: {
      enabled: true,
      directory,
      defaultDirectory: directory,
      directoryError: null,
      versionCount: 0,
      totalBytes: 0,
      repositories: [repository],
      ...overrides,
    },
  }));
}

describe('repository backup settings error toasts', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    api.isAvailable.mockReturnValue(true);
    showOverview();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const render = () =>
    act(async () =>
      root.render(
        <I18nProvider language="en">
          <BranchBackupSettings />
        </I18nProvider>,
      ),
    );
  const poll = () => act(async () => vi.advanceTimersByTimeAsync(5_000));

  it('toasts a failed manual backup without adding an inline error', async () => {
    api.backupNow.mockResolvedValue({ success: false, error: 'Bundle write failed.' });
    await render();
    const backup = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Back up now')!;
    await act(async () => backup.click());

    expect(api.backupNow).toHaveBeenCalledWith(repository.repoPath);
    expect(api.showToast).toHaveBeenCalledExactlyOnceWith('Bundle write failed.', true);
    expect(container.textContent).not.toContain('Bundle write failed.');
    expect(backup.disabled).toBe(false);
  });

  it('toasts a failed overview load once while polling and clears the initial loading state', async () => {
    api.overview.mockResolvedValue({ success: false, error: 'Could not read backups.' });
    await render();
    await poll();

    expect(api.showToast).toHaveBeenCalledExactlyOnceWith('Could not read backups.', true);
    expect(container.textContent).not.toContain('Could not read backups.');
    expect(container.textContent).not.toContain('Loading backups');
  });

  it('toasts repository and destination failures once per occurrence', async () => {
    const repoError = 'A local branch does not point to a commit.';
    const dirError = 'The drive is disconnected.';
    const failedRepository = { ...repository, lastError: repoError };
    showOverview({ repositories: [failedRepository] });
    await render();
    await poll();
    expect(api.showToast).toHaveBeenCalledExactlyOnceWith(`Example · ${repoError}`, true);
    expect(container.textContent).not.toContain(repoError);

    showOverview({ directoryError: dirError, repositories: [{ ...repository, lastError: dirError }] });
    await poll();
    await poll();
    expect(api.showToast).toHaveBeenCalledTimes(2);
    expect(api.showToast).toHaveBeenLastCalledWith(`Backup destination unavailable · ${dirError}`, true);
    expect(container.textContent).not.toContain(dirError);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    showOverview();
    await poll();
    showOverview({ repositories: [failedRepository] });
    await poll();
    expect(api.showToast).toHaveBeenCalledTimes(3);
    expect(api.showToast).toHaveBeenLastCalledWith(`Example · ${repoError}`, true);
  });
});
