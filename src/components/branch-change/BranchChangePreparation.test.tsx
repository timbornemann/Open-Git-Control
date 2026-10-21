// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { branchChangeClient } from '@/services/branchChangeClient';
import { BranchChangeDialog } from './BranchChangeDialog';
import { requestBranchChange, useBranchChangeDialogState } from './branchChangeDialogState';
import type { GitJobEventDto } from '@/types/aiDtos';
import type { BranchChangeInspection, BranchChangeResult } from '@/shared/ipc/branchChange';
import type { IpcResult } from '@/types/ipc';

const events = vi.hoisted(() => ({ listeners: new Set<(event: GitJobEventDto) => void>() }));
vi.mock('@/services/gitClient', () => ({
  gitClient: {
    isAvailable: () => true,
    onJobEvent: (listener: (event: GitJobEventDto) => void) => {
      events.listeners.add(listener);
      return () => events.listeners.delete(listener);
    },
  },
}));
vi.mock('@/services/branchChangeClient', () => ({
  branchChangeClient: {
    inspectBranchChange: vi.fn(),
    executeBranchChange: vi.fn(),
    cancelBranchChange: vi.fn(),
  },
}));
vi.mock('@/contexts/AppStateContext', () => ({ useWorkflowStore: () => vi.fn() }));
vi.mock('./BranchChangeFiles', () => ({ BranchChangeFiles: () => createElement('p', null, 'Reviewed files') }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const preview = (clean = false): BranchChangeInspection => ({
  planId: 'verified-plan',
  repoPath: '/repo',
  sourceBranch: 'feature',
  sourceHead: 'a'.repeat(40),
  target: { kind: 'create', branch: 'new-branch', startPoint: 'HEAD' },
  targetSha: 'a'.repeat(40),
  blocks: [],
  files: clean ? [] : [{ path: 'draft.txt', index: 'M', worktree: 'M', binary: false }],
  suggestedName: 'Saved changes',
});
const changed = vi.fn();
function Harness() {
  const dialog = useBranchChangeDialogState((value) => value.pending);
  return dialog ? createElement(BranchChangeDialog, { dialog, onChanged: changed, onWorktree: vi.fn() }) : null;
}
describe('immediate branch-change preparation', () => {
  let host: HTMLDivElement;
  let root: Root;
  let inspection: ReturnType<typeof deferred<IpcResult<BranchChangeInspection>>>;
  let pending: Promise<BranchChangeResult | null>;
  const button = (label: string) => [...host.querySelectorAll('button')].find((node) => node.textContent === label)!;
  const start = async () => {
    await act(async () => {
      root.render(createElement(I18nProvider, { language: 'en', children: createElement(Harness) }));
      pending = requestBranchChange('/repo', { kind: 'create', branch: 'new-branch', startPoint: 'HEAD' });
    });
  };
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    events.listeners.clear();
    useBranchChangeDialogState.getState().set(null);
    inspection = deferred();
    vi.mocked(branchChangeClient.inspectBranchChange).mockReturnValue(inspection.promise);
    vi.mocked(branchChangeClient.cancelBranchChange).mockResolvedValue(true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    act(() => {
      useBranchChangeDialogState.getState().pending?.finish(null);
      root.unmount();
    });
    host.remove();
    if (pending) await pending;
  });
  it('opens before inspection resolves, reports real counts and ignores other jobs', async () => {
    await start();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain('Preparing branch change');
    expect(host.textContent).toContain('new-branch');
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('progress')!.hasAttribute('value')).toBe(false);
    expect(host.textContent).not.toContain('Reviewed files');
    const id = useBranchChangeDialogState.getState().pending!.id;
    const event: GitJobEventDto = {
      id: 'main-job',
      operation: 'git:inspectBranchChange',
      status: 'progress',
      timestamp: Date.now(),
      message: 'Checking changed file contents',
      details: { repoPath: '/repo', branchChangeId: id, branchChange: { phase: 'files', processedFiles: 7, totalFiles: 20, path: 'src/draft.ts' } },
    };
    act(() => events.listeners.forEach((listener) => listener(event)));
    expect(host.textContent).toContain('Checked 7 of 20 files');
    expect(host.textContent).toContain('src/draft.ts');
    expect(host.querySelector('progress')!.getAttribute('value')).toBe('7');
    act(() => {
      events.listeners.forEach((listener) => listener({ ...event, message: 'Unrelated scan', details: { ...event.details, branchChangeId: 'another-job' } }));
      events.listeners.forEach((listener) => listener({ ...event, message: 'Background Git fetch', operation: 'git:fetch' }));
    });
    expect(host.textContent).not.toContain('Unrelated scan');
    expect(host.textContent).not.toContain('Background Git fetch');
    await act(async () => inspection.resolve({ success: true, data: preview() }));
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.textContent).toContain('Reviewed files');
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    expect(branchChangeClient.executeBranchChange).not.toHaveBeenCalled();
  });
  it('cancels the initial inspection on Escape and never executes a late preview', async () => {
    await start();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(await pending).toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(branchChangeClient.cancelBranchChange).toHaveBeenCalledWith('/repo');
    await act(async () => inspection.resolve({ success: true, data: preview(true) }));
    expect(useBranchChangeDialogState.getState().pending).toBeNull();
    expect(branchChangeClient.executeBranchChange).not.toHaveBeenCalled();
  });
  it('shows inspection errors in the modal and retries explicitly', async () => {
    await start();
    await act(async () => inspection.resolve({ success: false, error: 'Repository unavailable' }));
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Repository unavailable');
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    vi.mocked(branchChangeClient.inspectBranchChange).mockResolvedValueOnce({ success: true, data: preview() });
    await act(async () => button('Review again').click());
    expect(host.textContent).toContain('Reviewed files');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(branchChangeClient.executeBranchChange).not.toHaveBeenCalled();
  });
  it('keeps the progress modal open during an automatic clean checkout and closes on completion', async () => {
    const execution = deferred<IpcResult<BranchChangeResult>>();
    vi.mocked(branchChangeClient.executeBranchChange).mockReturnValue(execution.promise);
    await start();
    await act(async () => inspection.resolve({ success: true, data: preview(true) }));
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.textContent).toContain('Switching branch');
    const result = { switched: true, restored: true, conflicts: [] };
    await act(async () => execution.resolve({ success: true, data: result }));
    expect(await pending).toEqual(result);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('prevents a second inspection while the first preparation is still pending', async () => {
    await start();
    await expect(requestBranchChange('/repo', { kind: 'existing', branch: 'other' })).rejects.toThrow('Finish the current');
    expect(branchChangeClient.inspectBranchChange).toHaveBeenCalledOnce();
  });
  it('waits for a started checkout to settle after cancellation and refreshes the actual repository state', async () => {
    const execution = deferred<IpcResult<BranchChangeResult>>();
    vi.mocked(branchChangeClient.executeBranchChange).mockReturnValue(execution.promise);
    await start();
    await act(async () => inspection.resolve({ success: true, data: preview(true) }));
    act(() => button('Cancel').click());
    expect(host.textContent).toContain('Finishing cancellation');
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(branchChangeClient.cancelBranchChange).toHaveBeenCalledWith('/repo');
    await act(async () => execution.resolve({ success: false, error: 'Git operation was aborted.' }));
    expect(changed).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('aborted');
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    act(() => button('Close').click());
    expect(await pending).toBeNull();
  });
});
