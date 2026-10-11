// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'execCommand');
});

describe('copying text across desktop and browser clipboard permissions', () => {
  it('uses the native desktop bridge even when the browser denies clipboard writes', async () => {
    const nativeWrite = vi.fn().mockResolvedValue({ success: true });
    const browserWrite = vi.fn().mockRejectedValue(new Error('Write permission denied'));
    vi.stubGlobal('window', { electronAPI: { app: { writeClipboardText: nativeWrite } } });
    vi.stubGlobal('navigator', { clipboard: { writeText: browserWrite } });
    await expect(copyTextToClipboard('Diagnostic report\nä ö ü')).resolves.toBe(true);
    expect(nativeWrite).toHaveBeenCalledWith('Diagnostic report\nä ö ü');
    expect(browserWrite).not.toHaveBeenCalled();
  });

  it('does not report success or fall back silently when the native write fails', async () => {
    const nativeWrite = vi.fn().mockResolvedValueOnce({ success: false }).mockRejectedValueOnce(new Error('IPC failed'));
    const browserWrite = vi.fn();
    vi.stubGlobal('window', { electronAPI: { app: { writeClipboardText: nativeWrite } } });
    vi.stubGlobal('navigator', { clipboard: { writeText: browserWrite } });
    await expect(copyTextToClipboard('report')).resolves.toBe(false);
    await expect(copyTextToClipboard('report')).resolves.toBe(false);
    expect(browserWrite).not.toHaveBeenCalled();
  });

  it('retains browser copying with an older desktop bridge', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { electronAPI: { app: {} } });
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyTextToClipboard('report')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('report');
  });

  it('uses the text selection fallback after a denied browser write and removes its temporary element', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Write permission denied')) } });
    const execCommand = vi.fn(() => {
      expect(document.querySelector('textarea')?.value).toBe('report');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    await expect(copyTextToClipboard('report')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('handles a missing clipboard and failed text-selection copying without leaving an element behind', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockImplementationOnce(() => {
        throw new Error('Copy blocked');
      });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    await expect(copyTextToClipboard('report')).resolves.toBe(false);
    await expect(copyTextToClipboard('report')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('leaves the clipboard alone for empty text and handles a non-browser environment', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', {});
    await expect(copyTextToClipboard('')).resolves.toBe(false);
    vi.stubGlobal('document', undefined);
    await expect(copyTextToClipboard('report')).resolves.toBe(false);
  });
});
