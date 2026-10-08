// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { AiAutoCommitGroupDto } from '@/types/aiDtos';
import { AiCommitPlan } from './AiCommitPlan';
import { useAiCommit } from './useAiCommit';
import { gitClient } from '@/services/gitClient';
import type { GitStatusWithConflicts } from './types';

const mocks = vi.hoisted(() => ({ run: vi.fn(), cancel: vi.fn(), state: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/services/aiClient', () => ({
  aiClient: { isAvailable: () => true, runAutoCommit: mocks.run, cancelAutoCommit: mocks.cancel, getAutoCommitState: mocks.state, onJobEvent: mocks.subscribe },
}));
let host: HTMLDivElement;
let root: Root;
let controls: ReturnType<typeof useAiCommit>;
const refresh = vi.fn(async () => {});
const updated = vi.fn();
const toast = vi.fn();
const group: AiAutoCommitGroupDto = {
  id: 'staged',
  source: 'staged',
  changeIds: ['s1'],
  paths: ['packages/api.ts', 'tests/api.test.ts'],
  title: 'fix: preserve API state',
  description: 'Preserves the snapshot.',
  rationale: 'API and test belong together.',
  status: 'committed',
  messageSource: 'fallback',
  hash: 'abcdef0123456789',
};
const status = {
  staged: [{ path: 'same.ts', status: 'M' }],
  unstaged: [{ path: 'same.ts', status: 'M' }],
  untracked: [],
  conflicts: [],
} as unknown as GitStatusWithConflicts;
function Harness() {
  controls = useAiCommit({ repoPath: '/repo', status, setToast: toast, refresh, onCommitsCreated: updated });
  return createElement(AiCommitPlan, { groups: controls.aiGroups });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
  vi.spyOn(gitClient, 'ensureCommitIdentity').mockResolvedValue(true);
  mocks.state.mockResolvedValue({ success: true, data: null });
  mocks.subscribe.mockReturnValue(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  host.remove();
});

describe('AI commit plan and run controls', () => {
  it('does not start AI work or stage files when identity setup is cancelled', async () => {
    vi.mocked(gitClient.ensureCommitIdentity).mockResolvedValue(false);
    await act(async () => {
      root.render(createElement(I18nProvider, { language: 'en', children: createElement(Harness) }));
    });
    await act(async () => {
      await controls.handleAiAutoCommit();
    });
    expect(gitClient.ensureCommitIdentity).toHaveBeenCalledExactlyOnceWith('/repo');
    expect(mocks.run).not.toHaveBeenCalled();
    expect(controls.isAiCommitting).toBe(false);
    expect(controls.isAiJobRunning).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
  it('shows groups, staged source, paths, fallback and durable commit status', async () => {
    await act(async () => {
      root.render(createElement(I18nProvider, { language: 'en', children: createElement(AiCommitPlan, { groups: [group] }) }));
    });
    expect(host.textContent).toContain('Commit plan · 1/1');
    expect(host.textContent).toContain('Staged snapshot');
    expect(host.textContent).toContain('Fallback commit');
    expect(host.textContent).toContain('tests/api.test.ts');
    expect(host.querySelectorAll('summary')).toHaveLength(2);
    expect(host.querySelector('code')?.textContent).toBe('abcdef012345');
  });

  it('prevents duplicate starts, deduplicates file counters and retains partial results', async () => {
    let resolve!: (value: unknown) => void;
    mocks.run.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => {
      root.render(createElement(I18nProvider, { language: 'en', children: createElement(Harness) }));
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = controls.handleAiAutoCommit();
      void controls.handleAiAutoCommit();
    });
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(controls.aiRemainingFiles).toBe(1);
    await act(async () => {
      resolve({
        success: true,
        data: {
          outcome: 'partial',
          summary: 'One commit created; hook rejected the next.',
          groups: [group],
          commits: [{ hash: group.hash, subject: group.title }],
          warnings: [],
          diagnostics: [],
          processedFiles: 0,
          remainingFiles: 1,
        },
      });
      await pending;
    });
    expect(controls.aiGroups).toEqual([group]);
    expect(controls.isAiCommitting).toBe(false);
    expect(controls.aiPhase).toBe('failed');
    expect(controls.aiProcessedFiles).toBe(0);
    expect(controls.aiRemainingFiles).toBe(1);
    expect(toast).toHaveBeenLastCalledWith({ msg: 'One commit created; hook rejected the next.', isError: true });
    expect(updated).toHaveBeenCalled();
  });
});
