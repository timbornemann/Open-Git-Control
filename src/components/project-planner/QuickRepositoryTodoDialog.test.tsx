// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { ProjectPlannerData } from '@/types/projectPlanner';

type PlannerTestValue = {
  data: ProjectPlannerData;
  loading: boolean;
  busy: boolean;
  createItem: ReturnType<typeof vi.fn>;
  createRepositoryProject: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
};

const planner = vi.hoisted(() => ({ value: null as unknown as PlannerTestValue }));

vi.mock('@/contexts/ProjectPlannerContext', () => ({
  useProjectPlanner: () => planner.value,
}));

import { QuickRepositoryTodoDialog } from './QuickRepositoryTodoDialog';

const repoPath = 'C:\\repos\\demo';
const repositoryProject = {
  id: 'project-1',
  name: 'demo',
  description: '',
  kind: 'repository' as const,
  repoPath,
  createdAt: 1,
  updatedAt: 1,
};

describe('QuickRepositoryTodoDialog', () => {
  let host: HTMLDivElement;
  let root: Root;
  let requestId = 0;

  const render = () => {
    root.render(
      createElement(I18nProvider, {
        language: 'de',
        children: createElement(QuickRepositoryTodoDialog, { requestId, activeRepo: repoPath }),
      }),
    );
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    requestId = 0;
    planner.value = {
      data: { version: 1, projects: [repositoryProject], items: [] },
      loading: false,
      busy: false,
      createItem: vi.fn(),
      createRepositoryProject: vi.fn(),
      notify: vi.fn(),
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('opens the todo dialog for the active repository project', async () => {
    act(render);
    requestId = 1;
    await act(async () => {
      render();
      await Promise.resolve();
    });

    expect(host.querySelector('.dialog-modal')).toBeTruthy();
    expect(planner.value.createRepositoryProject).not.toHaveBeenCalled();
  });

  it('requires confirmation before creating a missing repository project', async () => {
    planner.value.data = { version: 1, projects: [], items: [] };
    planner.value.createRepositoryProject.mockResolvedValue(repositoryProject);
    act(render);
    requestId = 1;
    await act(async () => {
      render();
      await Promise.resolve();
    });

    expect(planner.value.createRepositoryProject).not.toHaveBeenCalled();
    const confirmButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Projekt hinzufuegen'));
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(planner.value.createRepositoryProject).toHaveBeenCalledWith(repoPath);
    expect(host.querySelector('.dialog-modal')).toBeTruthy();
  });
});
