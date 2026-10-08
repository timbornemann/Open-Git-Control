// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { closeSystemTools, receiveSystemTools, useSystemTools } from '@/app/state/systemToolsStore';
import type { SystemToolInstallEvent, SystemToolsStatus } from '@/shared/ipc/systemTools';
import { SystemToolsRuntime } from './SystemToolsRuntime';
import { SystemToolsWarning } from './SystemToolsWarning';
import { updateSystemToolsAvailability } from '@/services/systemToolsAvailability';
import { searchSettingsGroups } from '@/components/layout/settings/settingsNavigation';

const snapshot = (git: 'checking' | 'available' | 'missing' | 'unusable' = 'missing'): SystemToolsStatus => ({
  platform: 'win32',
  checkedAt: git === 'checking' ? null : 1,
  installation: null,
  tools: ['git', 'git-lfs', 'github-cli'].map((id) => ({
    id: id as 'git',
    required: id === 'git',
    state: id === 'git' ? git : 'missing',
    downloadUrl: `https://${id === 'git' ? 'git-scm.com/install/windows' : id === 'git-lfs' ? 'git-lfs.com/' : 'cli.github.com/'}`,
    instructionsUrl: 'https://git-scm.com/install/windows',
    installation: {
      available: true,
      method: 'winget',
      packageName: id === 'git' ? 'Git.Git' : id,
      source: 'winget',
      command: `winget install --id ${id === 'git' ? 'Git.Git' : id} --exact --source winget`,
    },
  })),
});
describe('shared tool dialog, warning and notifications', () => {
  let root: Root;
  let host: HTMLDivElement;
  let statusEvent: (status: SystemToolsStatus) => void;
  let installationEvent: (event: SystemToolInstallEvent) => void;
  const publish = vi.fn().mockReturnValue(42);
  const update = vi.fn().mockReturnValue(true);
  const recheck = vi.fn();
  const install = vi.fn();
  const download = vi.fn();
  const render = async () => {
    await act(async () =>
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(NotificationProvider, {
            value: { publish, update, dismiss: vi.fn() },
            children: [createElement(SystemToolsRuntime, { key: 'runtime' }), createElement(SystemToolsWarning, { key: 'warning' })],
          }),
        }),
      ),
    );
  };
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')];
  const click = async (text: string) => {
    const button = buttons().find((item) => item.textContent === text);
    if (!button) throw new Error(`Button missing: ${text}`);
    await act(async () => button.click());
  };
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useSystemTools.setState({ status: null, dialogOpen: false, reviewTool: null, startupShown: false, checking: false, error: null });
    updateSystemToolsAvailability([]);
    recheck.mockResolvedValue(snapshot());
    install.mockResolvedValue({ success: true, data: { operationId: 'install', toolId: 'git', phase: 'done' } });
    vi.stubGlobal('electronAPI', undefined);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        app: {
          getSystemToolsStatus: async () => useSystemTools.getState().status || snapshot('checking'),
          onSystemToolsStatus: (listener: typeof statusEvent) => {
            statusEvent = listener;
            return vi.fn();
          },
          onSystemToolInstallation: (listener: typeof installationEvent) => {
            installationEvent = listener;
            return vi.fn();
          },
          recheckSystemTools: recheck,
          installSystemTool: install,
          openExternalUrl: download,
        },
      },
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    delete (window as Partial<Window>).electronAPI;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for a negative Git result, shows the dialog once, and retains the warning after Later', async () => {
    await render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('.activity-tools-warning')).toBeNull();
    act(() => statusEvent(snapshot()));
    expect(host.textContent).toContain('Git is required');
    expect(host.textContent).toContain('Your saved repositories are preserved');
    expect(host.textContent).toContain('Optional');
    await click('Later');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const warning = host.querySelector<HTMLButtonElement>('.activity-tools-warning')!;
    expect(warning.getAttribute('aria-label')).toContain('Git is not usable');
    act(() => statusEvent(snapshot()));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => warning.click());
    expect(host.textContent).toContain('Git is required');
    act(() => closeSystemTools());
    act(() => statusEvent(snapshot('available')));
    expect(host.querySelector('.activity-tools-warning')).toBeNull();
    expect(install).not.toHaveBeenCalled();
  });
  it('does not nag for optional tools, opens official URLs and requires a reviewed installation command', async () => {
    receiveSystemTools(snapshot('available'));
    await render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('.activity-tools-warning')).toBeNull();
    act(() => window.dispatchEvent(new CustomEvent('system-tools:open', { detail: 'git-lfs' })));
    const lfs = host.querySelector('[data-tool="git-lfs"]')!;
    await act(async () => [...lfs.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Official download')!.click());
    expect(download).toHaveBeenCalledWith('https://git-lfs.com/');
    await act(async () => [...lfs.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Install')!.click());
    expect(install).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Package source: winget');
    expect(host.textContent).toContain('winget install --id git-lfs');
    const confirm =
      host.querySelector<HTMLButtonElement>('.dialog-footer .primary-btn') ||
      buttons()
        .filter((button) => button.textContent === 'Install')
        .at(-1)!;
    await act(async () => confirm.click());
    expect(install).toHaveBeenCalledExactlyOnceWith({ toolId: 'git-lfs' });
  });
  it('keeps installation phases in one central notification and lets dialogs close without cancelling', async () => {
    await render();
    act(() => installationEvent({ operationId: 'one', toolId: 'git', phase: 'installing' }));
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'progress', autoHideMs: null, progress: { value: null, label: 'Installing package …' } }),
    );
    act(() => closeSystemTools());
    act(() => installationEvent({ operationId: 'one', toolId: 'git', phase: 'verifying' }));
    expect(update).toHaveBeenCalledWith(42, expect.objectContaining({ msg: 'Verifying tool …' }));
    act(() => installationEvent({ operationId: 'one', toolId: 'git', phase: 'done' }));
    expect(update).toHaveBeenCalledWith(42, expect.objectContaining({ kind: 'success', autoHideMs: 6000 }));
    expect(update.mock.lastCall?.[1].progress).toBeUndefined();
    expect(install).not.toHaveBeenCalled();
  });
  it('shows agreements before sending explicit consent and surfaces installation failure centrally', async () => {
    await render();
    act(() => statusEvent(snapshot()));
    act(() => installationEvent({ operationId: 'terms', toolId: 'git', phase: 'agreements-required', agreements: 'License terms to read' }));
    expect(host.textContent).toContain('License terms to read');
    install.mockResolvedValue({ success: false, error: 'Rights rejected' });
    await click('Agree and install');
    expect(install).toHaveBeenCalledWith({ toolId: 'git', acceptAgreements: true });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ msg: 'Rights rejected', isError: true }));
  });
  it('rechecks on focus and only polls missing Git in a visible app', async () => {
    vi.useFakeTimers();
    await render();
    act(() => statusEvent(snapshot()));
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(recheck).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(recheck).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(recheck).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => statusEvent(snapshot('available')));
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(recheck).toHaveBeenCalledTimes(2);
  });
  it('includes tool management in the settings search', () => {
    expect(searchSettingsGroups('git lfs', (_de, en) => en).map((group) => group.id)).toContain('tools');
    expect(searchSettingsGroups('werkzeuge', (de) => de).map((group) => group.id)).toContain('tools');
  });
});
