import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPlannerProvider, useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { plannerClient } from '@/services/plannerClient';
import type { PlannerProject, ProjectPlannerData } from '@/types/projectPlanner';

const EMPTY_DATA: ProjectPlannerData = { version: 1, projects: [], items: [] };

const createProject = (id: string, repoPath: string): PlannerProject => ({
  id,
  name: id,
  description: '',
  kind: 'repository',
  repoPath,
  createdAt: 1,
  updatedAt: 1,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProjectPlannerProvider', () => {
  const renderProvider = (initialActiveRepo: string | null, initialRefreshSignal = 0) => {
    let activeRepo = initialActiveRepo;
    let refreshSignal = initialRefreshSignal;
    let current: ReturnType<typeof useProjectPlanner> | undefined;
    const root: Root = createRoot(document.createElement('div'));
    const onRepositorySelected = vi.fn().mockResolvedValue(undefined);
    const onRepositoryMaterialized = vi.fn().mockResolvedValue(undefined);
    const onToast = vi.fn();
    const setConfirmDialog = vi.fn();

    const Consumer = () => {
      current = useProjectPlanner();
      return null;
    };
    const render = () => {
      root.render(
        createElement(
          ProjectPlannerProvider,
          {
            activeRepo,
            refreshSignal,
            onRepositorySelected,
            onRepositoryMaterialized,
            onToast,
            setConfirmDialog,
          },
          createElement(Consumer),
        ),
      );
    };

    act(render);
    return {
      get current() {
        if (!current) throw new Error('Planner context did not render.');
        return current;
      },
      rerender: (nextActiveRepo: string | null, nextRefreshSignal: number) => {
        activeRepo = nextActiveRepo;
        refreshSignal = nextRefreshSignal;
        act(render);
      },
      unmount: () => act(() => root.unmount()),
    };
  };

  it('keeps newer planner data when an older refresh finishes last', async () => {
    vi.spyOn(plannerClient, 'isAvailable').mockReturnValue(true);
    const older = deferred<{ success: true; data: ProjectPlannerData }>();
    const newer = deferred<{ success: true; data: ProjectPlannerData }>();
    const newerProject = createProject('newer', 'C:\\repos\\newer');
    vi.spyOn(plannerClient, 'getData')
      .mockResolvedValueOnce({ success: true, data: EMPTY_DATA })
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);

    const provider = renderProvider(null);
    await act(async () => {
      await Promise.resolve();
    });

    let olderRefresh!: Promise<void>;
    let newerRefresh!: Promise<void>;
    act(() => {
      olderRefresh = provider.current.refresh();
      newerRefresh = provider.current.refresh();
    });

    await act(async () => {
      newer.resolve({ success: true, data: { version: 1, projects: [newerProject], items: [] } });
      await newerRefresh;
    });
    await act(async () => {
      older.resolve({ success: true, data: { version: 1, projects: [createProject('older', 'C:\\repos\\older')], items: [] } });
      await olderRefresh;
    });

    expect(provider.current.data.projects.map((project) => project.id)).toEqual(['newer']);
    provider.unmount();
  });

  it('retries a failed repository ensure when the refresh signal changes', async () => {
    const project = createProject('demo', 'C:\\repos\\demo');
    vi.spyOn(plannerClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(plannerClient, 'getData').mockResolvedValue({
      success: true,
      data: { version: 1, projects: [project], items: [] },
    });
    const ensureRepositoryProject = vi
      .spyOn(plannerClient, 'ensureRepositoryProject')
      .mockResolvedValueOnce({ success: false, error: 'planner locked' })
      .mockResolvedValueOnce({ success: true, data: project });

    const provider = renderProvider('C:\\repos\\demo');
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(ensureRepositoryProject).toHaveBeenCalledTimes(1);

    provider.rerender('C:\\repos\\demo', 1);
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(ensureRepositoryProject).toHaveBeenCalledTimes(2);
    expect(provider.current.error).toBeNull();
    provider.unmount();
  });

  it('clears the old selection on a repository switch and ignores a late ensure response', async () => {
    const repoA = createProject('repo-a', 'C:\\repos\\a');
    const repoB = createProject('repo-b', 'C:\\repos\\b');
    const lateRepoA = deferred<{ success: true; data: PlannerProject }>();
    vi.spyOn(plannerClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(plannerClient, 'getData').mockResolvedValue({
      success: true,
      data: { version: 1, projects: [repoA, repoB], items: [] },
    });
    vi.spyOn(plannerClient, 'ensureRepositoryProject').mockImplementation((repoPath) => {
      return repoPath === repoA.repoPath ? lateRepoA.promise : Promise.resolve({ success: true, data: repoB });
    });

    const provider = renderProvider(repoA.repoPath);
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(provider.current.selectedProjectId).toBe(repoA.id);

    provider.rerender(repoB.repoPath, 0);
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(provider.current.selectedProjectId).toBe(repoB.id);

    await act(async () => {
      lateRepoA.resolve({ success: true, data: repoA });
      await lateRepoA.promise;
    });
    expect(provider.current.selectedProjectId).toBe(repoB.id);
    provider.unmount();
  });
});
