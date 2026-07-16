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
  vi.spyOn(plannerClient, 'onDataChanged').mockReturnValue(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProjectPlannerProvider', () => {
  const renderProvider = (
    initialActiveRepo: string | null,
    initialRefreshSignal = 0,
    callbacks: { onRepositoryMaterialized?: ReturnType<typeof vi.fn> } = {},
    initialPlannerActive = false,
  ) => {
    let activeRepo = initialActiveRepo;
    let refreshSignal = initialRefreshSignal;
    let plannerActive = initialPlannerActive;
    let current: ReturnType<typeof useProjectPlanner> | undefined;
    const root: Root = createRoot(document.createElement('div'));
    const onRepositorySelected = vi.fn().mockResolvedValue(undefined);
    const onRepositoryMaterialized = callbacks.onRepositoryMaterialized || vi.fn().mockResolvedValue(undefined);
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
            plannerActive,
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
      rerender: (nextActiveRepo: string | null, nextRefreshSignal: number, nextPlannerActive = plannerActive) => {
        activeRepo = nextActiveRepo;
        refreshSignal = nextRefreshSignal;
        plannerActive = nextPlannerActive;
        act(render);
      },
      unmount: () => act(() => root.unmount()),
      onToast,
      onRepositoryMaterialized,
      setConfirmDialog,
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

  it('only creates a repository project after confirmation when entering project planning', async () => {
    const project = createProject('demo', 'C:\\repos\\demo');
    vi.spyOn(plannerClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(plannerClient, 'getData')
      .mockResolvedValueOnce({ success: true, data: EMPTY_DATA })
      .mockResolvedValue({ success: true, data: { version: 1, projects: [project], items: [] } });
    const ensureRepositoryProject = vi.spyOn(plannerClient, 'ensureRepositoryProject').mockResolvedValue({ success: true, data: project });

    const provider = renderProvider('C:\\repos\\demo');
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(ensureRepositoryProject).not.toHaveBeenCalled();

    provider.rerender('C:\\repos\\demo', 0, true);
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(ensureRepositoryProject).not.toHaveBeenCalled();
    const prompt = provider.setConfirmDialog.mock.calls.at(-1)?.[0];
    expect(prompt).toEqual(
      expect.objectContaining({
        variant: 'confirm',
        confirmLabel: expect.stringMatching(/Projekt hinzufuegen|Add project/),
      }),
    );

    await act(async () => {
      await prompt?.onConfirm();
    });

    expect(ensureRepositoryProject).toHaveBeenCalledWith('C:\\repos\\demo');
    expect(provider.current.selectedProjectId).toBe(project.id);
    provider.unmount();
  });

  it('updates the selected project on a repository switch without creating planning data', async () => {
    const repoA = createProject('repo-a', 'C:\\repos\\a');
    const repoB = createProject('repo-b', 'C:\\repos\\b');
    vi.spyOn(plannerClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(plannerClient, 'getData').mockResolvedValue({
      success: true,
      data: { version: 1, projects: [repoA, repoB], items: [] },
    });
    const ensureRepositoryProject = vi.spyOn(plannerClient, 'ensureRepositoryProject');

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
    expect(ensureRepositoryProject).not.toHaveBeenCalled();
    provider.unmount();
  });

  it('keeps a successful mutation successful when only the follow-up refresh fails', async () => {
    const project = createProject('created', 'C:\\repos\\created');
    vi.spyOn(plannerClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(plannerClient, 'getData').mockResolvedValueOnce({ success: true, data: EMPTY_DATA }).mockRejectedValueOnce(new Error('refresh offline'));
    vi.spyOn(plannerClient, 'createProject').mockResolvedValue({ success: true, data: project });

    const provider = renderProvider(null);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    let created: PlannerProject | null = null;
    await act(async () => {
      created = await provider.current.createProject({ name: 'Created' });
    });

    expect(created).toEqual(project);
    expect(provider.onToast).toHaveBeenCalledWith(expect.stringMatching(/Aenderung gespeichert|Change saved/), true);
    provider.unmount();
  });

  it('does not invite duplicate materialization when only repository activation fails', async () => {
    const planned: PlannerProject = {
      id: 'planned',
      name: 'Planned',
      description: '',
      kind: 'planned',
      repoPath: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const materialized = createProject('planned', 'C:\\repos\\planned');
    vi.spyOn(plannerClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(plannerClient, 'getData')
      .mockResolvedValueOnce({ success: true, data: { version: 1, projects: [planned], items: [] } })
      .mockResolvedValueOnce({ success: true, data: { version: 1, projects: [materialized], items: [] } });
    vi.spyOn(plannerClient, 'materializeProject').mockResolvedValue({
      success: true,
      data: { project: materialized, repoPath: materialized.repoPath! },
    });
    const onRepositoryMaterialized = vi.fn().mockRejectedValue(new Error('workspace switch failed'));
    const provider = renderProvider(null, 0, { onRepositoryMaterialized });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    let result = false;
    await act(async () => {
      result = await provider.current.materializeProject(planned.id, 'C:\\repos', 'planned');
    });

    expect(result).toBe(true);
    expect(onRepositoryMaterialized).toHaveBeenCalledWith(materialized.repoPath);
    expect(provider.onToast).toHaveBeenCalledWith(expect.stringMatching(/created, but could not be activated|erstellt, aber nicht aktiviert/i), true);
    provider.unmount();
  });
});
