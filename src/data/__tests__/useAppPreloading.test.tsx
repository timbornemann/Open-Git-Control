// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plannerClient } from '@/services/plannerClient';
import { scheduleViewModulePreloads } from '../viewModulePreloading';
import { useAppPreloading } from '../useAppPreloading';

vi.mock('../viewModulePreloading', () => ({ scheduleViewModulePreloads: vi.fn() }));
vi.mock('../preloading', () => ({ preloadRepository: vi.fn() }));
vi.mock('@/app/state/systemToolsStore', () => ({ useGitAvailable: () => false }));

describe('view preloading lifecycle', () => {
  let root: Root;
  let host: HTMLDivElement;
  let stopped: ReturnType<typeof vi.fn>[];
  function Harness({ tab, repo = null }: { tab: string; repo?: string | null }) {
    useAppPreloading(repo, [], tab, false);
    return null;
  }
  const render = (tab: string, repo: string | null = null) => act(async () => root.render(<Harness tab={tab} repo={repo} />));
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    stopped = [];
    vi.mocked(scheduleViewModulePreloads).mockImplementation(() => {
      const stop = vi.fn();
      stopped.push(stop);
      return stop;
    });
    vi.spyOn(plannerClient, 'getData').mockResolvedValue({ success: true, data: { version: 1, projects: [], items: [] } });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('schedules the active page and cleans up the old schedule before navigating or unmounting', async () => {
    await render('repo');
    expect(scheduleViewModulePreloads).toHaveBeenCalledExactlyOnceWith('repo');
    expect(stopped[0]).not.toHaveBeenCalled();
    await render('hosting');
    expect(scheduleViewModulePreloads).toHaveBeenNthCalledWith(2, 'hosting');
    expect(stopped[0]).toHaveBeenCalledOnce();
    act(() => root.render(null));
    expect(stopped[1]).toHaveBeenCalledOnce();
    expect(plannerClient.getData).not.toHaveBeenCalled();
  });

  it('does not restart module loading for repository restoration or unrelated rerenders', async () => {
    await render('repo');
    await render('repo', 'C:/restored');
    await render('repo', 'C:/other');
    expect(scheduleViewModulePreloads).toHaveBeenCalledOnce();
    expect(stopped[0]).not.toHaveBeenCalled();
  });

  it('cleans up Strict Mode replay and keeps planner data loading scoped to the active page', async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <Harness tab="planner" />
        </StrictMode>,
      ),
    );
    expect(scheduleViewModulePreloads).toHaveBeenCalledTimes(2);
    expect(stopped[0]).toHaveBeenCalledOnce();
    expect(stopped[1]).not.toHaveBeenCalled();
    expect(plannerClient.getData).toHaveBeenCalledTimes(2);
    await render('settings');
    expect(stopped[1]).toHaveBeenCalledOnce();
    expect(scheduleViewModulePreloads).toHaveBeenLastCalledWith('settings');
    expect(plannerClient.getData).toHaveBeenCalledTimes(2);
  });
});
