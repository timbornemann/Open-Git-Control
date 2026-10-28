// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullTransferRecovery } from './PullTransferRecovery';
import type { GitPullRecoveryDto } from '@/types/remoteTransfers';

vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));

let root: Root;
let container: HTMLDivElement;
const retry = vi.fn();
const switchToDefault = vi.fn();
const openWorkspace = vi.fn();
const failedPull = { repoPath: '/repo', remote: 'origin', branch: 'test-branch', mode: 'rebase' as const };
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const render = (recovery: GitPullRecoveryDto, busy = false) =>
  act(() => root.render(createElement(PullTransferRecovery, { failedPull, busy, retry, openWorkspace, switchToDefault, recovery })));
function button(text: string) {
  return [...container.querySelectorAll('button')].find((node) => node.textContent === text);
}
describe('deleted remote branch recovery panel', () => {
  it('shows the missing source and offers the verified default rather than a conflict retry', () => {
    render({ branchExists: false, defaultBranch: { name: 'trunk', localExists: false } });
    expect(container.textContent).toContain('origin/test-branch');
    expect(container.textContent).toContain('local branch and its commits are preserved');
    expect(button('Retry this pull source')).toBeUndefined();
    act(() => button('Switch to trunk')!.click());
    expect(switchToDefault).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
  it('keeps manual branch selection available when the server default cannot be verified', () => {
    render({ branchExists: false, defaultBranch: null });
    expect(container.textContent).toContain('could not be determined safely');
    expect(container.textContent).not.toContain('Switch to main');
    act(() => button('Open workspace')!.click());
    expect(openWorkspace).toHaveBeenCalledOnce();
  });
  it('retries the original source if that branch has reappeared', () => {
    render({ branchExists: true, defaultBranch: { name: 'main', localExists: true } });
    expect(button('Switch to main')).toBeUndefined();
    act(() => button('Retry this pull source')!.click());
    expect(retry).toHaveBeenCalledWith(failedPull);
  });
  it('disables recovery actions while a transfer is running', () => {
    render({ branchExists: false, defaultBranch: { name: 'main', localExists: true } }, true);
    act(() => button('Switch to main')!.click());
    expect(switchToDefault).not.toHaveBeenCalled();
    expect(button('Open workspace')!.disabled).toBe(true);
  });
});
