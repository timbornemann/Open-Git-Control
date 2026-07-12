// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { RepositoryLicensePanel } from './RepositoryLicensePanel';

const setConfirmDialog = vi.fn();
const onToast = vi.fn();
const triggerRefresh = vi.fn();

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog }),
  useRepositoryContext: () => ({ onToast, triggerRefresh }),
}));

vi.mock('@/services/gitClient', () => ({
  gitClient: {
    isAvailable: vi.fn(),
    readRepoFile: vi.fn(),
    writeRepoFile: vi.fn(),
    deleteRepoFile: vi.fn(),
  },
}));

describe('RepositoryLicensePanel', () => {
  let host: HTMLDivElement;
  let root: Root;

  const flush = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
  };

  const setHolder = (value: string) => {
    const holderInput = host.querySelector('input') as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(holderInput, value);
    holderInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const selectLicense = (value: string) => {
    const licenseSelect = host.querySelector('select') as HTMLSelectElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    valueSetter?.call(licenseSelect, value);
    licenseSelect.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const expandLicensePanel = () => {
    if (host.querySelector('select')) return;
    const toggle = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Lizenz'));
    toggle?.click();
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setConfirmDialog.mockReset();
    onToast.mockReset();
    triggerRefresh.mockReset();
    vi.mocked(gitClient.isAvailable).mockReset().mockReturnValue(true);
    vi.mocked(gitClient.readRepoFile).mockReset().mockResolvedValue({ success: false });
    vi.mocked(gitClient.writeRepoFile).mockReset().mockResolvedValue({ success: true });
    vi.mocked(gitClient.deleteRepoFile).mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('adds a selected license when the repository has no license file', async () => {
    await act(async () => {
      root.render(createElement(RepositoryLicensePanel, { repoPath: 'C:/Repos/Example' }));
    });
    await flush();

    act(() => {
      expandLicensePanel();
    });
    act(() => {
      setHolder('Example Organization');
    });
    const addButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Lizenz hinzufuegen'));
    await act(async () => addButton?.click());

    expect(gitClient.writeRepoFile).toHaveBeenCalledWith('LICENSE', expect.stringContaining('Copyright (c)'), 'C:/Repos/Example');
    expect(triggerRefresh).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('LICENSE wurde hinzugefuegt.', false);
  });

  it('requires confirmation before replacing an existing license', async () => {
    vi.mocked(gitClient.readRepoFile).mockResolvedValueOnce({ success: true, data: 'existing license' });
    await act(async () => {
      root.render(createElement(RepositoryLicensePanel, { repoPath: 'C:/Repos/Example' }));
    });
    await flush();

    act(() => {
      expandLicensePanel();
    });
    act(() => {
      setHolder('Example Organization');
    });
    const replaceButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Lizenz ersetzen'));
    act(() => replaceButton?.click());

    expect(setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lizenz ersetzen?' }));
  });

  it('keeps the copyright holder editable for Apache and can be collapsed', async () => {
    await act(async () => {
      root.render(createElement(RepositoryLicensePanel, { repoPath: 'C:/Repos/Example' }));
    });
    await flush();

    act(() => {
      expandLicensePanel();
    });
    act(() => {
      selectLicense('Apache-2.0');
    });
    expect((host.querySelector('input') as HTMLInputElement).disabled).toBe(false);

    const toggle = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Lizenz'));
    act(() => toggle?.click());

    expect(host.querySelector('select')).toBeNull();
  });

  it('updates an existing Apache NOTICE when the copyright holder changes', async () => {
    vi.mocked(gitClient.readRepoFile).mockImplementation(async (filePath) => ({
      success: filePath === 'LICENSE' || filePath === 'NOTICE',
      data: 'existing file',
    }));
    await act(async () => {
      root.render(createElement(RepositoryLicensePanel, { repoPath: 'C:/Repos/Example' }));
    });
    await flush();

    act(() => {
      expandLicensePanel();
    });
    act(() => {
      selectLicense('Apache-2.0');
    });
    act(() => {
      setHolder('Updated Organization');
    });
    const replaceButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Lizenz ersetzen'));
    act(() => replaceButton?.click());
    const dialog = setConfirmDialog.mock.calls.at(-1)?.[0];
    await act(async () => dialog.onConfirm());

    expect(gitClient.writeRepoFile).toHaveBeenCalledWith('NOTICE', expect.stringContaining('Updated Organization'), 'C:/Repos/Example');
    expect(onToast).toHaveBeenCalledWith('LICENSE und NOTICE wurden aktualisiert.', false);
  });

  it('removes an obsolete NOTICE when replacing an Apache license with a license that does not need one', async () => {
    vi.mocked(gitClient.readRepoFile).mockImplementation(async (filePath) => ({
      success: filePath === 'LICENSE' || filePath === 'NOTICE.md',
      data: 'existing file',
    }));
    await act(async () => {
      root.render(createElement(RepositoryLicensePanel, { repoPath: 'C:/Repos/Example' }));
    });
    await flush();

    act(() => {
      expandLicensePanel();
    });
    act(() => {
      setHolder('Example Organization');
    });
    const replaceButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Lizenz ersetzen'));
    act(() => replaceButton?.click());
    const dialog = setConfirmDialog.mock.calls.at(-1)?.[0];
    await act(async () => dialog.onConfirm());

    expect(gitClient.deleteRepoFile).toHaveBeenCalledWith('NOTICE.md', 'C:/Repos/Example');
    expect(onToast).toHaveBeenCalledWith('LICENSE wurde aktualisiert und NOTICE entfernt.', false);
  });

  it('automatically collapses after detecting a license but keeps the panel open after a manual expansion', async () => {
    vi.mocked(gitClient.readRepoFile).mockResolvedValueOnce({ success: true, data: 'existing license' });
    await act(async () => {
      root.render(createElement(RepositoryLicensePanel, { repoPath: 'C:/Repos/Example' }));
    });
    await flush();

    expect(host.querySelector('select')).toBeNull();
    act(() => {
      expandLicensePanel();
    });
    expect(host.querySelector('select')).not.toBeNull();

    await flush();
    expect(host.querySelector('select')).not.toBeNull();
  });
});
