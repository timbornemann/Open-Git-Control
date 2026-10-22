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
  selectedProjectId: string | null;
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
  let activeRepo: string | null = repoPath;
  let preferSelectedProject = false;

  const render = () => {
    root.render(
      createElement(I18nProvider, {
        language: 'de',
        children: createElement(QuickRepositoryTodoDialog, { requestId, activeRepo, preferSelectedProject }),
      }),
    );
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    requestId = 0;
    activeRepo = repoPath;
    preferSelectedProject = false;
    planner.value = {
      data: { version: 1, projects: [repositoryProject], items: [] },
      loading: false,
      busy: false,
      createItem: vi.fn(),
      createRepositoryProject: vi.fn(),
      notify: vi.fn(),
      selectedProjectId: repositoryProject.id,
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
  it('uses the selected planner project even without an active repository', async () => {
    activeRepo = null;
    preferSelectedProject = true;
    act(render);
    requestId = 1;
    await act(async () => render());
    expect(host.querySelector('.dialog-modal')).toBeTruthy();
    expect(planner.value.notify).not.toHaveBeenCalled();
    expect(planner.value.createRepositoryProject).not.toHaveBeenCalled();
    const title = host.querySelector<HTMLInputElement>('.planner-dialog-form input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(title, 'Shortcut task');
      title.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('.dialog-btn-primary')!.click());
    expect(planner.value.createItem).toHaveBeenCalledExactlyOnceWith(repositoryProject.id, expect.objectContaining({ title: 'Shortcut task' }));
  });
  it('uses the active repository outside the planner even if a different project is selected', async () => {
    planner.value.selectedProjectId = 'different-project';
    act(render);
    requestId = 1;
    await act(async () => render());
    expect(host.querySelector('.dialog-modal')).toBeTruthy();
    expect(planner.value.createRepositoryProject).not.toHaveBeenCalled();
  });
  it('waits for planner data and handles a request only once', async () => {
    activeRepo = null;
    preferSelectedProject = true;
    planner.value.loading = true;
    act(render);
    requestId = 1;
    await act(async () => render());
    expect(planner.value.notify).not.toHaveBeenCalled();
    expect(host.querySelector('.dialog-modal')).toBeNull();
    planner.value.loading = false;
    await act(async () => render());
    await act(async () => render());
    expect(host.querySelectorAll('.dialog-modal')).toHaveLength(1);
  });
  it('explains missing context rather than silently ignoring the shortcut', async () => {
    activeRepo = null;
    planner.value.selectedProjectId = null;
    act(render);
    requestId = 1;
    await act(async () => render());
    expect(planner.value.notify).toHaveBeenCalledWith(expect.stringContaining('Repository öffnen'), true);
  });
});
