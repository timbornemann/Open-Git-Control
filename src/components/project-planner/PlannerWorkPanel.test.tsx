// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { plannerClient } from '@/services/plannerClient';
import { appClient } from '@/services/appClient';
import { PlannerWorkPanel } from './PlannerWorkPanel';
import { usePlannerCompletion } from './usePlannerCompletion';
import type { PlannerItem } from '@/types/projectPlanner';
import type { PlannerWorkDetails } from '@/types/plannerWork';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), close: vi.fn(), confirm: vi.fn(), transfer: vi.fn(), create: vi.fn() }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select({ onNavigateToCommit: mocks.navigate }),
  useUIContext: () => ({ setConfirmDialog: mocks.confirm }),
}));
vi.mock('@/components/hosting/remoteTransferDialogState', () => ({ requestRemoteTransfer: mocks.transfer }));
vi.mock('@/components/hosting/HostingCreateChangeRequest', () => ({
  HostingCreateChangeRequest: (props: unknown) => {
    mocks.create(props);
    return null;
  },
}));
vi.mock('@/services/plannerClient', () => ({
  plannerClient: { getWork: vi.fn(), refreshWork: vi.fn(), updateWork: vi.fn(), onDataChanged: vi.fn(() => () => {}) },
}));
vi.mock('@/services/appClient', () => ({ appClient: { openExternalUrl: vi.fn() } }));
const branch = {
  id: 'work',
  projectId: 'project',
  name: 'task/fix',
  baseRef: 'refs/remotes/origin/main',
  baseSha: 'a'.repeat(40),
  startedAt: 1,
  automationPaused: true,
};
const pr = {
  provider: 'github' as const,
  server: 'https://code.invalid',
  repositoryId: '42',
  fullPath: 'team/repo',
  workflowId: 'work',
  id: '1',
  number: '1',
  url: 'https://code.invalid/team/repo/pull/1',
};
const item: PlannerItem = {
  id: 'task',
  projectId: 'project',
  title: 'Fix a bug',
  description: 'Description',
  priority: 'medium',
  status: 'in-progress',
  tags: ['Bug'],
  createdAt: 1,
  updatedAt: 1,
  references: { activeWorkflowId: 'work', branches: [branch], pullRequests: [pr] },
};
const details = (): PlannerWorkDetails => ({
  itemId: item.id,
  revision: 'current-revision',
  workflowId: 'work',
  commits: [{ sha: 'b'.repeat(40), subject: 'External work', timestamp: 1, state: 'current' }],
  requests: [{ ...pr, title: 'The PR', state: 'open', headSha: 'b'.repeat(40), sourceBranch: branch.name, targetBranch: 'main' }],
});

describe('planner work details and completion', () => {
  let host: HTMLDivElement;
  let root: Root;
  const render = async (workItem = item) =>
    act(async () =>
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(PlannerWorkPanel, { repoPath: '/repo', item: workItem, onNavigate: mocks.close }),
        }),
      ),
    );
  const button = (text: string) => [...host.querySelectorAll('button')].find((entry) => entry.textContent?.includes(text))!;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(plannerClient.getWork).mockResolvedValue({ success: true, data: details() });
    vi.mocked(plannerClient.updateWork).mockResolvedValue({ success: true, data: item });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it('opens cached work offline with explicit navigation and browser links only on click', async () => {
    await render();
    expect(plannerClient.refreshWork).not.toHaveBeenCalled();
    expect(appClient.openExternalUrl).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Status automation is paused');
    act(() => button('External work').click());
    expect(mocks.navigate).toHaveBeenCalledWith('b'.repeat(40));
    expect(mocks.close).toHaveBeenCalled();
    act(() => button('The PR').click());
    expect(appClient.openExternalUrl).toHaveBeenCalledWith(pr.url);
  });
  it('keeps the only archived assignment and its cached history accessible without a server refresh', async () => {
    await render({ ...item, references: { ...item.references!, activeWorkflowId: undefined } });
    expect(host.textContent).toContain('Previous assignments');
    const archive = host.querySelectorAll('details')[1];
    await act(async () => {
      archive.open = true;
      archive.dispatchEvent(new Event('toggle'));
    });
    expect(plannerClient.getWork).toHaveBeenCalledWith({ repoPath: '/repo', itemId: item.id, workflowId: 'work' });
    expect(host.textContent).toContain('External work');
    expect(plannerClient.refreshWork).not.toHaveBeenCalled();
  });
  it('resumes automation with the reviewed task revision and opens explicit publishing', async () => {
    await render();
    await act(async () => button('Resume automation').click());
    expect(plannerClient.updateWork).toHaveBeenCalledWith({
      repoPath: '/repo',
      itemId: item.id,
      expectedRevision: 'current-revision',
      action: 'automation',
      paused: false,
    });
    act(() => button('Publish branch').click());
    expect(mocks.transfer).toHaveBeenCalledWith(expect.objectContaining({ mode: 'push', expectedBranch: branch.name, destinationBranch: branch.name }));
  });
  it('prefills the shared PR editor only after the explicit action', async () => {
    vi.mocked(plannerClient.getWork).mockResolvedValue({
      success: true,
      data: { ...details(), hostingRepository: { ref: { connectionId: 'local', repositoryId: '42', fullPath: 'team/repo' }, defaultBranch: 'main' } as any },
    });
    await render();
    expect(mocks.create).not.toHaveBeenCalled();
    act(() => button('Create PR').click());
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      initialDraft: { title: item.title, body: item.description, sourceBranch: 'task/fix', targetBranch: 'main' },
    });
  });
  it('the mixed AI completion action only closes live unlinked tasks, including when references changed during generation', async () => {
    const unlinked = { ...item, id: 'unlinked', references: undefined };
    const update = vi.fn(async () => true);
    let complete!: ReturnType<typeof usePlannerCompletion>;
    const Harness = ({ tasks }: { tasks: PlannerItem[] }) => {
      complete = usePlannerCompletion(tasks, update);
      return null;
    };
    act(() => root.render(createElement(Harness, { tasks: [item, unlinked] })));
    await act(async () => complete([item, unlinked]));
    expect(update).toHaveBeenCalledExactlyOnceWith('unlinked', { status: 'done', expectedUpdatedAt: 1 });
    update.mockClear();
    act(() => root.render(createElement(Harness, { tasks: [item, { ...unlinked, references: item.references }] })));
    await act(async () => complete([item, unlinked]));
    expect(update).not.toHaveBeenCalled();
  });
});
