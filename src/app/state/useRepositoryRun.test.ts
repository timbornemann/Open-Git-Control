// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { useRepositoryRun } from './useRepositoryRun';
import {
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from '@/components/working-directory/workingDirectoryNavigationGuard';

describe('useRepositoryRun configuration binding', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(repositoryRunClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(repositoryRunClient, 'getState').mockResolvedValue({ success: true, data: null } as any);
    vi.spyOn(repositoryRunClient, 'onEvent').mockReturnValue(vi.fn());
  });

  afterEach(() => {
    resetWorkingDirectoryNavigationGuardForTests();
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('clears the old configuration and ignores a late response after switching repositories', async () => {
    let resolveFirstConfig: ((value: any) => void) | undefined;
    vi.spyOn(repositoryRunClient, 'getConfig').mockImplementation((repoPath) =>
      repoPath === 'C:/repo-a'
        ? new Promise((resolve) => {
            resolveFirstConfig = resolve;
          })
        : new Promise<void>(() => {}),
    );
    let current: ReturnType<typeof useRepositoryRun> | null = null;
    const Harness = ({ activeRepo }: { activeRepo: string | null }) => {
      current = useRepositoryRun({ activeRepo, triggerRefresh: vi.fn() });
      return null;
    };

    await act(async () => root.render(createElement(Harness, { activeRepo: 'C:/repo-a' })));
    await act(async () => root.render(createElement(Harness, { activeRepo: 'C:/repo-b' })));
    expect(current?.activeRunConfig).toBeNull();

    await act(async () => resolveFirstConfig?.({ success: true, data: { configPath: 'C:/repo-a/.ogc.json' } }));

    expect(current?.activeRunConfig).toBeNull();
  });

  it('bounds output received from both getState and full state events by lines and UTF-8 bytes', async () => {
    const oversizedState = {
      runId: 'run-1',
      repoPath: 'C:/repo-a',
      action: 'test',
      status: 'running',
      startedAt: Date.now(),
      activeStepIndex: 0,
      stepCount: 1,
      steps: [],
      output: Array.from({ length: 5_000 }, (_, sequence) => ({
        sequence,
        stream: 'stdout',
        text: 'x'.repeat(1024),
        timestamp: Date.now(),
        stepIndex: 0,
      })),
    } as any;
    vi.mocked(repositoryRunClient.getState).mockResolvedValue({ success: true, data: oversizedState });
    let eventHandler: ((event: any) => void) | undefined;
    vi.mocked(repositoryRunClient.onEvent).mockImplementation((handler) => {
      eventHandler = handler;
      return vi.fn();
    });
    vi.spyOn(repositoryRunClient, 'getConfig').mockImplementation(() => new Promise<void>(() => {}));
    let current: ReturnType<typeof useRepositoryRun> | null = null;
    const triggerRefresh = vi.fn();
    const Harness = () => {
      current = useRepositoryRun({ activeRepo: 'C:/repo-a', triggerRefresh });
      return null;
    };

    await act(async () => root.render(createElement(Harness)));
    await act(async () => await Promise.resolve());
    const getRetainedBytes = () => current!.runState!.output.reduce((total, line) => total + new TextEncoder().encode(line.text).length, 0);
    expect(current!.runState!.output.length).toBeLessThanOrEqual(4_000);
    expect(getRetainedBytes()).toBeLessThanOrEqual(2 * 1024 * 1024);

    await act(async () => eventHandler?.({ type: 'state', state: { ...oversizedState, runId: 'run-2' } }));
    expect(current!.runState!.runId).toBe('run-2');
    expect(current!.runState!.output.length).toBeLessThanOrEqual(4_000);
    expect(getRetainedBytes()).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('does not open the run console until dirty-editor navigation is allowed', async () => {
    vi.mocked(repositoryRunClient.getState).mockResolvedValue({
      success: true,
      data: { runId: 'run-1', repoPath: 'C:/repo-a', status: 'succeeded', output: [] },
    } as any);
    vi.spyOn(repositoryRunClient, 'getConfig').mockResolvedValue({ success: true, data: null } as any);
    let current: ReturnType<typeof useRepositoryRun> | null = null;
    const triggerRefresh = vi.fn();
    const Harness = () => {
      current = useRepositoryRun({ activeRepo: 'C:/repo-a', triggerRefresh });
      return null;
    };
    await act(async () => root.render(createElement(Harness)));
    await vi.waitFor(() => expect(current?.runState?.runId).toBe('run-1'));

    let proceed: (() => void) | undefined;
    setActiveWorkingDirectoryNavigationGuard((_target, next) => (proceed = next));
    act(() => current!.openRunConsole());
    expect(current!.isRunConsoleOpen).toBe(false);
    act(() => proceed?.());
    expect(current!.isRunConsoleOpen).toBe(true);
  });
});
