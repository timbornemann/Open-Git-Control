// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { PlannerItem } from '@/types/projectPlanner';
import { plannerClient } from '@/services/plannerClient';
import { ItemDialog } from './PlannerDialogs';
import { PlannerItemWorkPanel } from './PlannerItemWorkPanel';
import { PlannerWorkDialog } from './PlannerWorkDialog';
import { usePlannerWorkDialogState } from './plannerWorkDialogState';

const mocks = vi.hoisted(() => ({
  data: { items: [] as PlannerItem[] },
  git: { currentBranch: 'task/fix', onNavigateToCommit: vi.fn() },
  refresh: vi.fn(async () => {}),
  activate: vi.fn(),
  submit: vi.fn(),
  navigate: vi.fn(),
  changed: vi.fn(),
  createPr: vi.fn(),
}));
vi.mock('@/contexts/ProjectPlannerContext', () => ({
  useProjectPlanner: () => ({ data: mocks.data, refresh: mocks.refresh, activateRepositoryProject: mocks.activate }),
}));
vi.mock('@/contexts/AppStateContext', () => ({ useGitStore: (select: (state: unknown) => unknown) => select(mocks.git), useWorkflowStore: () => vi.fn() }));
vi.mock('@/services/plannerClient', () => ({
  plannerClient: {
    inspectWork: vi.fn(),
    startWork: vi.fn(),
    getWork: vi.fn(),
    refreshWork: vi.fn(),
    updateWork: vi.fn(),
    onDataChanged: vi.fn(() => () => {}),
  },
}));
vi.mock('@/components/hosting/HostingCreateChangeRequest', () => ({
  HostingCreateChangeRequest: (props: unknown) => {
    mocks.createPr(props);
    return createElement('div', null, 'PR editor');
  },
}));

const branch = {
  id: 'workflow',
  projectId: 'project',
  name: 'task/fix',
  baseRef: 'refs/heads/main',
  baseSha: 'a'.repeat(40),
  startedAt: 1,
  automationPaused: false,
};
const item: PlannerItem = {
  id: 'task',
  projectId: 'project',
  title: 'Fix a bug',
  description: 'Details',
  status: 'in-progress',
  priority: 'medium',
  tags: ['Bug'],
  createdAt: 1,
  updatedAt: 1,
  references: { activeWorkflowId: branch.id, branches: [branch], pullRequests: [] },
};

function Editor({ editedItem }: { editedItem: PlannerItem }) {
  const workflowOpen = usePlannerWorkDialogState((state) => Boolean(state.target));
  return (
    <>
      <PlannerWorkDialog activeRepo="/repo" onChanged={mocks.changed} />
      <ItemDialog
        open
        suspended={workflowOpen}
        item={editedItem}
        busy={false}
        onClose={vi.fn()}
        onSubmit={mocks.submit}
        workPanel={
          <PlannerItemWorkPanel
            item={editedItem}
            original={editedItem}
            repoPath="/repo"
            onReload={vi.fn()}
            onNavigate={mocks.navigate}
            onMaterialize={vi.fn()}
          />
        }
      />
    </>
  );
}

describe('independent task workflow', () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = async (editedItem = item) =>
    act(async () => root.render(createElement(I18nProvider, { language: 'en', children: createElement(Editor, { editedItem }) })));
  const button = (text: string) => [...host.querySelectorAll('button')].find((entry) => entry.textContent?.includes(text))!;
  const open = () => act(async () => button('Open task workflow').click());
  const escape = () => act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.git.currentBranch = branch.name;
    mocks.data.items = [item];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    usePlannerWorkDialogState.setState({ target: null });
    vi.mocked(plannerClient.getWork).mockResolvedValue({
      success: true,
      data: {
        itemId: item.id,
        workflowId: branch.id,
        revision: 'reviewed',
        commits: [],
        requests: [],
        hostingRepository: { ref: { connectionId: 'local', repositoryId: '42', fullPath: 'team/repo' } } as any,
      },
    });
    vi.mocked(plannerClient.inspectWork).mockResolvedValue({
      success: true,
      data: {
        planId: 'plan',
        item,
        suggestedName: branch.name,
        bases: [],
        defaultBase: '',
        changes: [],
        worktrees: [],
        existing: branch,
      },
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    usePlannerWorkDialogState.setState({ target: null });
  });
  it('replaces the editor with one dialog, shows the active phase, and preserves an unsaved draft on Escape', async () => {
    await render();
    const title = host.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'My unsaved title');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.textContent).not.toContain('Workflow phases');
    expect(plannerClient.getWork).not.toHaveBeenCalled();
    await open();
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Task workflow');
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Work');
    expect(host.textContent).toContain('Active here');
    expect(button('Resume work')).toBeUndefined();
    expect(button('Switch to task branch')).toBeUndefined();
    expect(plannerClient.inspectWork).not.toHaveBeenCalled();
    expect(plannerClient.refreshWork).not.toHaveBeenCalled();
    escape();
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('My unsaved title');
    await act(async () => host.querySelector<HTMLButtonElement>('.dialog-btn-primary')!.click());
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ title: 'My unsaved title' }));
  });
  it('changes branch through a review step in place and returns to the overview before the item editor', async () => {
    mocks.git.currentBranch = 'main';
    await render();
    await open();
    expect(host.textContent).toContain('Currently checked out: main');
    await act(async () => button('Switch to task branch').click());
    expect(plannerClient.inspectWork).toHaveBeenCalledOnce();
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Switch to task branch');
    expect(plannerClient.startWork).not.toHaveBeenCalled();
    escape();
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Task workflow');
    escape();
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Edit item');
  });
  it('keeps PR creation and archive confirmation inside the same workflow dialog', async () => {
    await render();
    await open();
    act(() => button('Create PR').click());
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Create PR');
    expect(host.textContent).toContain('PR editor');
    expect(mocks.createPr.mock.calls[0][0]).toMatchObject({ initialDraft: { title: item.title, sourceBranch: branch.name, targetBranch: 'main' } });
    escape();
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Task workflow');
    act(() => button('Archive assignment').click());
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('[aria-label="Confirm archive"]')).not.toBeNull();
    expect(plannerClient.updateWork).not.toHaveBeenCalled();
    act(() => button('Cancel').click());
    expect(host.querySelector('[aria-label="Confirm archive"]')).toBeNull();
  });
  it('shows the newly active branch immediately after successful start without offering another checkout', async () => {
    const unlinked = { ...item, status: 'bug' as const, references: undefined };
    mocks.data.items = [unlinked];
    mocks.git.currentBranch = 'main';
    vi.mocked(plannerClient.inspectWork).mockResolvedValue({
      success: true,
      data: {
        planId: 'plan',
        item: unlinked,
        suggestedName: branch.name,
        bases: [{ ref: branch.baseRef, sha: branch.baseSha }],
        defaultBase: branch.baseRef,
        changes: [],
        worktrees: [],
      },
    });
    vi.mocked(plannerClient.startWork).mockResolvedValue({ success: true, data: { branch: branch.name, item: { ...item, updatedAt: 2 } } });
    await render(unlinked);
    await act(async () => button('Start work').click());
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Start');
    await act(async () => button('Create branch and start').click());
    expect(host.textContent).toContain('Active here');
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Work');
    expect(button('Switch to task branch')).toBeUndefined();
  });
  it('updates the branch action after an external checkout and keeps keyboard focus in the visible dialog', async () => {
    await render();
    await open();
    await act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 0);
        }),
    );
    expect(document.activeElement).toBe(host.querySelector('.planner-work-title'));
    const back = button('Back to item');
    act(() => {
      back.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(button('Publish branch'));
    mocks.git.currentBranch = 'main';
    await render();
    expect(button('Switch to task branch')).toBeDefined();
    mocks.git.currentBranch = branch.name;
    await render();
    expect(button('Switch to task branch')).toBeUndefined();
    expect(plannerClient.startWork).not.toHaveBeenCalled();
  });
});
