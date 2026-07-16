// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';

const planner = vi.hoisted(() => ({
  value: {
    data: {
      version: 1 as const,
      projects: [
        {
          id: 'project-1',
          name: 'Desktop app',
          description: '',
          kind: 'planned' as const,
          repoPath: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      items: [],
    },
    selectedProjectId: 'project-1',
    selectProject: vi.fn(),
    loading: false,
    busy: false,
    requestCreateProject: vi.fn(),
    requestCreateItem: vi.fn(),
    requestEditProject: vi.fn(),
    requestDeleteProject: vi.fn(),
  },
}));

vi.mock('@/contexts/ProjectPlannerContext', () => ({
  useProjectPlanner: () => planner.value,
}));

import { ProjectPlannerSidebarContent } from './ProjectPlannerSidebarContent';

describe('ProjectPlannerSidebarContent project context menu', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    planner.value.selectProject.mockReset();
    planner.value.requestCreateProject.mockReset();
    planner.value.requestCreateItem.mockReset();
    planner.value.requestEditProject.mockReset();
    planner.value.requestDeleteProject.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('opens quick project actions from a right click and creates a todo for that project', () => {
    act(() => {
      root.render(createElement(I18nProvider, { language: 'de', children: createElement(ProjectPlannerSidebarContent) }));
    });

    const projectRow = host.querySelector('.planner-sidebar-project-row');
    act(() => {
      projectRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    });

    const todoButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Todo erstellen'));
    expect(todoButton).toBeTruthy();

    act(() => todoButton?.click());
    expect(planner.value.requestCreateItem).toHaveBeenCalledWith('project-1');
  });
});
