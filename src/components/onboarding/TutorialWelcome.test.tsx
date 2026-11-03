// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import * as bridge from '@/services/electronApi';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';
import { TutorialWelcome, useTutorialWelcome } from './TutorialWelcome';

describe('first-launch introduction', () => {
  let root: Root;
  let container: HTMLDivElement;
  let seen: boolean;
  const startTutorial = vi.fn();
  const acknowledge = vi.fn();
  function Harness() {
    const welcome = useTutorialWelcome();
    return <I18nProvider language="de">{welcome.visible && <TutorialWelcome onClose={welcome.dismiss} />}</I18nProvider>;
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    seen = false;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    startTutorial.mockReset().mockResolvedValue({ success: true });
    acknowledge.mockReset().mockImplementation(async () => {
      seen = true;
      return { version: 1, welcomeSeen: seen, completedChapters: [] };
    });
    vi.spyOn(bridge, 'getElectronApi').mockReturnValue({
      app: {
        getTutorialProgress: async () => ({ version: 1, welcomeSeen: seen, completedChapters: [] }),
        acknowledgeTutorialWelcome: acknowledge,
        startTutorial,
      },
    } as unknown as ElectronAPI);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('records actual presentation, starts the basic tour and never presents again on remount', async () => {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(acknowledge).toHaveBeenCalledOnce();
    await act(async () => container.querySelector<HTMLButtonElement>('.primary')!.click());
    expect(startTutorial).toHaveBeenCalledWith({ chapterId: 'basics' });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      root.render(null);
    });
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it('allows skipping and keeps focus within the welcome while it is open', async () => {
    await act(async () => root.render(<Harness />));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    buttons.at(-1)!.focus();
    act(() => buttons.at(-1)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => buttons.at(-1)!.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(startTutorial).not.toHaveBeenCalled();
    expect(seen).toBe(true);
  });
  it('shows a retryable error when opening the separate renderer fails', async () => {
    startTutorial.mockResolvedValue({ success: false, error: 'Unavailable' });
    await act(async () => root.render(<Harness />));
    await act(async () => container.querySelector<HTMLButtonElement>('.primary')!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('erneut');
    expect(container.querySelector<HTMLButtonElement>('.primary')!.disabled).toBe(false);
  });
  it('does not interrupt existing users or an unavailable bridge', async () => {
    seen = true;
    await act(async () => root.render(<Harness />));
    expect(container.textContent).toBe('');
    expect(acknowledge).not.toHaveBeenCalled();
    vi.mocked(bridge.getElectronApi).mockReturnValue(null);
    await act(async () => root.render(<Harness key="unavailable" />));
    expect(container.textContent).toBe('');
  });
});
