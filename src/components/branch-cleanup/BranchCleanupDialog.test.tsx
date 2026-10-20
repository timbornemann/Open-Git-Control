// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { BranchCleanupInspection, BranchCleanupResult } from '@/shared/ipc/branchCleanup';
import type { IpcResult } from '@/types/ipc';
import { BranchCleanupDialog } from './BranchCleanupDialog';
import { cleanupInspection } from './__tests__/fixtures';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
describe('branch cleanup review dialog', () => {
  let root: Root, host: HTMLDivElement;
  let plan: BranchCleanupInspection;
  const changed = vi.fn(),
    close = vi.fn();
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    plan = cleanupInspection();
    changed.mockReset();
    close.mockReset();
    vi.spyOn(gitClient, 'inspectBranchCleanup').mockImplementation(async () => ({ success: true, data: structuredClone(plan) }));
    vi.spyOn(gitClient, 'onJobEvent').mockReturnValue(() => {});
    vi.spyOn(gitClient, 'cancelBranchCleanup').mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  const render = async (repoPath = 'C:/repo', language: 'de' | 'en' = 'en') => {
    await act(async () =>
      root.render(createElement(I18nProvider, { language, children: createElement(BranchCleanupDialog, { repoPath, onClose: close, onChanged: changed }) })),
    );
  };
  const confirm = () => host.querySelector<HTMLButtonElement>('.dialog-footer .dialog-btn-danger')!;
  const check = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="Select ${name} for deletion"]`)!;
  const button = (text: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent === text)!;

  it('starts inspection without deleting, preselects safe local branches and exposes blocked reasons', async () => {
    const execute = vi.spyOn(gitClient, 'executeBranchCleanup');
    await render();
    expect(gitClient.inspectBranchCleanup).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(check('local-done').checked).toBe(true);
    expect(check('server-done').checked).toBe(false);
    expect(check('orphaned').checked).toBe(false);
    expect(check('main').disabled).toBe(true);
    expect(host.textContent).toContain('Currently checked-out branch');
    expect(confirm().textContent).toBe('Delete 1 local and 0 server branches');
  });

  it('confirms the exact local/server selection and presents partial results', async () => {
    const execute = vi.spyOn(gitClient, 'executeBranchCleanup').mockResolvedValue({
      success: true,
      data: {
        cancelled: false,
        outcomes: [
          { id: 'local-done', name: 'local-done', kind: 'local', status: 'deleted', message: 'deleted' },
          { id: 'server-done', name: 'server-done', kind: 'server', status: 'unknown', message: 'Disconnected' },
        ],
      },
    });
    await render();
    act(() => check('server-done').click());
    expect(confirm().textContent).toBe('Delete 1 local and 1 server branches');
    await act(async () => confirm().click());
    expect(execute.mock.calls[0][0]).toMatchObject({
      repoPath: 'C:/repo',
      planId: 'plan',
      selectedIds: ['local-done', 'server-done'],
      confirmedUnmergedIds: [],
    });
    expect(host.textContent).toContain('Outcome unknown');
    expect(changed).toHaveBeenCalledOnce();
    await act(async () => button('Done').click());
    expect(close).toHaveBeenCalledOnce();
  });

  it('requires a separate explicit confirmation for branches with unmerged commits', async () => {
    const execute = vi.spyOn(gitClient, 'executeBranchCleanup').mockResolvedValue({ success: true, data: { outcomes: [], cancelled: false } });
    await render();
    act(() => check('orphaned').click());
    act(() => confirm().click());
    expect(execute).not.toHaveBeenCalled();
    expect(confirm().disabled).toBe(true);
    expect(host.textContent).toContain('2 unmerged commits');
    act(() => host.querySelector<HTMLInputElement>('.branch-cleanup-force-confirm input')!.click());
    await act(async () => confirm().click());
    expect(execute.mock.calls[0][0].confirmedUnmergedIds).toEqual(['orphaned']);
  });

  it('rechecks changed comparison targets and drops explicit server selections on new inspection', async () => {
    await render();
    act(() => check('server-done').click());
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = 'other-target';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(gitClient.inspectBranchCleanup).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetOverrides: { local: 'other-target', origin: 'server-target' } }),
    );
    expect(check('server-done').checked).toBe(false);
  });

  it('saves protection patterns and starts a new inspection without deleting', async () => {
    const save = vi.spyOn(gitClient, 'saveBranchCleanupPreferences').mockResolvedValue({ success: true, data: { protectedPatterns: ['main', 'release/*'] } });
    const execute = vi.spyOn(gitClient, 'executeBranchCleanup');
    await render();
    act(() => {
      const textarea = host.querySelector('textarea')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'main\nrelease/*');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(confirm().disabled).toBe(true);
    await act(async () => button('Save protection and inspect again').click());
    expect(save).toHaveBeenCalledWith('C:/repo', { protectedPatterns: ['main', 'release/*'] });
    expect(gitClient.inspectBranchCleanup).toHaveBeenCalledTimes(2);
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops pending deletion on Escape and keeps completed outcomes visible', async () => {
    const pending = deferred<IpcResult<BranchCleanupResult>>();
    const execute = vi.spyOn(gitClient, 'executeBranchCleanup').mockReturnValue(pending.promise);
    await render();
    act(() => confirm().click());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(gitClient.cancelBranchCleanup).toHaveBeenCalledWith(execute.mock.calls[0][0].operationId);
    expect(close).not.toHaveBeenCalled();
    await act(async () =>
      pending.resolve({
        success: true,
        data: { cancelled: true, outcomes: [{ id: 'local-done', name: 'local-done', kind: 'local', status: 'deleted', message: 'deleted' }] },
      }),
    );
    expect(host.textContent).toContain('1 branches deleted.');
    expect(host.textContent).toContain('Cancelled');
  });

  it('cancels old repository inspections and ignores their delayed response', async () => {
    const old = deferred<IpcResult<BranchCleanupInspection>>();
    vi.mocked(gitClient.inspectBranchCleanup).mockReturnValueOnce(old.promise);
    await render('C:/old');
    const oldId = vi.mocked(gitClient.inspectBranchCleanup).mock.calls[0][0].operationId;
    plan.candidates[0].name = 'new-repo-branch';
    await render('C:/new');
    await act(async () => old.resolve({ success: true, data: cleanupInspection() }));
    expect(gitClient.cancelBranchCleanup).toHaveBeenCalledWith(oldId);
    expect(host.textContent).toContain('new-repo-branch');
    expect(host.querySelector('.branch-cleanup-repository')?.textContent).toBe('C:/new');
  });

  it('renders the German review and prevents an expired plan from submitting', async () => {
    plan.expiresAt = Date.now() - 1;
    const execute = vi.spyOn(gitClient, 'executeBranchCleanup');
    await render('C:/repo', 'de');
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Branches aufräumen');
    await act(async () => confirm().click());
    expect(execute).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('abgelaufen');
  });
});
