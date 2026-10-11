// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { SettingsDiagnosticsSection } from '../SettingsDiagnosticsSection';

const api = vi.hoisted(() => ({ isAvailable: vi.fn(), getDiagnosticsReport: vi.fn(), showToast: vi.fn() }));
vi.mock('@/services/appClient', () => ({ appClient: api }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => api.showToast }));

describe('copying diagnostics from settings', () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    api.isAvailable.mockReturnValue(true);
    api.getDiagnosticsReport.mockResolvedValue({ success: true, data: { report: 'diagnostic report' } });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  const click = async () => {
    await act(async () => root.render(createElement(I18nProvider, { language: 'en' }, createElement(SettingsDiagnosticsSection))));
    await act(async () => container.querySelector('button')!.click());
  };

  it('copies via Electron when navigator.clipboard rejects writes', async () => {
    const writeText = vi.fn().mockResolvedValue({ success: true });
    const browserWrite = vi.fn().mockRejectedValue(new Error("Failed to execute 'writeText' on 'Clipboard': Write permission denied."));
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { app: { writeClipboardText: writeText } } });
    vi.stubGlobal('navigator', { clipboard: { writeText: browserWrite } });
    await click();
    expect(writeText).toHaveBeenCalledWith('diagnostic report');
    expect(browserWrite).not.toHaveBeenCalled();
    expect(api.showToast).toHaveBeenCalledWith('Diagnostics report copied.', false);
    expect(container.querySelector('button')!.disabled).toBe(false);
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('also copies when the browser clipboard API is absent', async () => {
    const writeText = vi.fn().mockResolvedValue({ success: true });
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { app: { writeClipboardText: writeText } } });
    vi.stubGlobal('navigator', {});
    await click();
    expect(writeText).toHaveBeenCalledWith('diagnostic report');
    expect(api.showToast).toHaveBeenCalledWith('Diagnostics report copied.', false);
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('shows an error and releases the button if the native clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard locked'));
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { app: { writeClipboardText: writeText } } });
    await click();
    expect(api.showToast).toHaveBeenCalledWith('Could not copy diagnostics report.', true);
    expect(container.querySelector('button')!.disabled).toBe(false);
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('does not copy a failed or empty report', async () => {
    const writeText = vi.fn();
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { app: { writeClipboardText: writeText } } });
    api.getDiagnosticsReport.mockResolvedValueOnce({ success: false, error: 'Report failed' });
    await click();
    expect(api.showToast).toHaveBeenCalledWith('Report failed', true);
    api.getDiagnosticsReport.mockResolvedValueOnce({ success: true, data: { report: '' } });
    await click();
    expect(api.showToast).toHaveBeenCalledWith('Could not create diagnostics report.', true);
    expect(writeText).not.toHaveBeenCalled();
    Reflect.deleteProperty(window, 'electronAPI');
  });
});
