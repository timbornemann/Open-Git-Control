import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepoUnavailableWorkflow } from '../useRepoUnavailableWorkflow';
import type { ConfirmDialogState } from '@/app/state/contracts';
import { gitClient } from '@/services/gitClient';
import { plannerClient } from '@/services/plannerClient';
import type { RepoUnavailablePayload } from '@/shared/git/errors';
import { Confirm } from '@/components/Confirm';

let listener: (payload: RepoUnavailablePayload) => void;
const recover = vi.fn(),
  remove = vi.fn(),
  toast = vi.fn(),
  plannerRefresh = vi.fn();
const missing = 'C:/old/demo';
function renderWorkflow() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const setDialog = vi.fn();
  const Harness = ({ active }: { active: string }) => {
    useRepoUnavailableWorkflow({
      activeRepo: active,
      handleRecoverRepo: recover,
      handleCloseRepo: remove,
      setGitActionToast: toast,
      setConfirmDialog: setDialog,
      setPlannerRefreshSignal: plannerRefresh,
      language: 'de',
    });
    return null;
  };
  const render = (active = missing) => act(() => root.render(createElement(Harness, { active })));
  render();
  return {
    render,
    get dialog() {
      return setDialog.mock.calls.at(-1)?.[0] as ConfirmDialogState;
    },
    setDialog,
    unmount: () => act(() => root.unmount()),
  };
}
beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  recover.mockReset().mockResolvedValue(true);
  remove.mockReset();
  toast.mockReset();
  plannerRefresh.mockReset();
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitClient, 'onRepoUnavailable').mockImplementation((callback) => {
    listener = callback;
    return vi.fn();
  });
  vi.spyOn(plannerClient, 'deleteRepositoryProjectByPath');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const unavailable = () => act(() => listener({ repoPath: missing, command: 'status', error: '[REPO_UNAVAILABLE]' }));

describe('unavailable repository recovery actions', () => {
  it('offers all four app-styled actions with preservation text, safe keyboard focus and a separate removal confirmation', async () => {
    const hook = renderWorkflow();
    unavailable();
    const dialog = hook.dialog;
    expect(dialog.confirmLabel).toBe('Neuen Speicherort auswählen');
    expect(dialog.secondaryActionLabel).toBe('Erneut prüfen');
    expect(dialog.consequences).toContain('Planungsdaten erhalten');
    const container = document.createElement('div'),
      root = createRoot(container);
    document.body.append(container);
    act(() => root.render(createElement(Confirm, { ...dialog, open: true, cancelLabel: 'Abbrechen', onCancel: () => {} })));
    expect(Array.from(container.querySelectorAll('button')).map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['Neuen Speicherort auswählen', 'Erneut prüfen', 'Repository entfernen…', 'Abbrechen']),
    );
    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
    expect(document.activeElement?.textContent).toBe('Neuen Speicherort auswählen');
    expect(dialog.message).not.toContain('entfernt');
    const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Erneut prüfen')!;
    retry.focus();
    const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    retry.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(recover).not.toHaveBeenCalled();
    act(() => dialog.contextAction?.onClick());
    expect(hook.dialog.confirmLabel).not.toBe(dialog.confirmLabel);
    expect(recover).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    act(() => root.unmount());
    hook.unmount();
  });
  it.each([true, false])('recovers without deleting planning data, selecting a new folder: %s', async (select) => {
    const hook = renderWorkflow();
    unavailable();
    await act(async () => {
      await (select ? hook.dialog.onConfirm() : hook.dialog.onSecondaryAction?.());
    });
    expect(recover).toHaveBeenCalledWith(missing, select);
    expect(plannerClient.deleteRepositoryProjectByPath).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(plannerRefresh).toHaveBeenCalled();
    expect(plannerRefresh.mock.calls[0][0](7)).toBe(8);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ isError: false }));
    // A later disappearance must still be recoverable, including the same path.
    unavailable();
    expect(hook.setDialog).toHaveBeenCalledTimes(2);
    hook.unmount();
  });
  it('keeps the recovery options after cancelling the picker or failing validation, and uses central notifications', async () => {
    const hook = renderWorkflow();
    unavailable();
    recover.mockResolvedValueOnce(false);
    await act(async () => {
      await hook.dialog.onConfirm();
    });
    expect(hook.setDialog).toHaveBeenCalledTimes(2);
    expect(toast).not.toHaveBeenCalled();
    recover.mockRejectedValueOnce(new Error('Not a Git repository'));
    await act(async () => {
      await hook.dialog.onConfirm();
    });
    expect(hook.setDialog).toHaveBeenCalledTimes(3);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ isError: true, msg: expect.stringContaining('Not a Git repository') }));
    expect(remove).not.toHaveBeenCalled();
    hook.unmount();
  });
  it('ignores duplicate events while checking and releases stale dialog callbacks after a repository switch', async () => {
    const hook = renderWorkflow();
    unavailable();
    let finish!: (result: boolean) => void;
    recover.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let pending!: Promise<void>;
    const dialog = hook.dialog;
    await act(async () => {
      pending = dialog.onConfirm() as Promise<void>;
      await Promise.resolve();
    });
    unavailable();
    expect(hook.setDialog).toHaveBeenCalledTimes(1);
    // Re-render this same hook instance with the new path.
    hook.render('C:/other');
    await act(async () => {
      finish(false);
      await pending;
      await dialog.onConfirm();
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    hook.unmount();
  });
  it('does not update a closed view when recovery completes later', async () => {
    const hook = renderWorkflow();
    unavailable();
    const dialog = hook.dialog;
    let finish!: (result: boolean) => void;
    recover.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = dialog.onConfirm() as Promise<void>;
      await Promise.resolve();
    });
    hook.unmount();
    await act(async () => {
      finish(true);
      await pending;
      dialog.contextAction?.onClick();
    });
    expect(toast).not.toHaveBeenCalled();
    expect(plannerRefresh).not.toHaveBeenCalled();
    expect(hook.setDialog).toHaveBeenCalledTimes(1);
  });
  it('refuses a stale removal confirmation and releases the removal guard after completion', async () => {
    const cleanups: Array<() => void> = [];
    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') cleanups.push(() => callback());
      return 1;
    });
    const hook = renderWorkflow();
    unavailable();
    act(() => hook.dialog.contextAction?.onClick());
    const removal = hook.dialog;
    hook.render('C:/other');
    await act(async () => {
      await removal.onConfirm();
    });
    expect(remove).not.toHaveBeenCalled();
    hook.render(missing);
    unavailable();
    act(() => hook.dialog.contextAction?.onClick());
    await act(async () => {
      await hook.dialog.onConfirm();
    });
    expect(remove).toHaveBeenCalledWith(missing);
    const before = hook.setDialog.mock.calls.length;
    act(() => {
      cleanups.forEach((cleanup) => cleanup());
    });
    unavailable();
    expect(hook.setDialog).toHaveBeenCalledTimes(before + 1);
    hook.unmount();
  });
});
