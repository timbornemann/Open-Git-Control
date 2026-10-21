// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type AppLanguage } from '@/i18n';
import type { ProjectPlannerData } from '@/types/projectPlanner';
import { QuickRepositoryTodoDialog } from '@/components/project-planner/QuickRepositoryTodoDialog';
import { useRepositoryTodoDraftState } from '@/components/project-planner/repositoryTodoDraftState';
import { runLines, sampleRun } from '@/utils/__tests__/repositoryRunFixture';
import { RepositoryRunConsole } from './RepositoryRunConsole';

const planner = vi.hoisted(() => ({
  data: { version: 1, projects: [], items: [] } as ProjectPlannerData,
  loading: false,
  busy: false,
  createItem: vi.fn(),
  createRepositoryProject: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('@/contexts/ProjectPlannerContext', () => ({ useProjectPlanner: () => planner }));
vi.mock('@/contexts/AppStateContext', () => ({ useRepositoryContext: () => ({ onToast: vi.fn() }) }));

const project = {
  id: 'project-1',
  name: 'Demo',
  kind: 'repository' as const,
  repoPath: 'D:/Projects/Software/A^3',
  description: '',
  createdAt: 1,
  updatedAt: 1,
};
const diagnosticRun = () => {
  const run = sampleRun();
  run.steps = [
    { label: 'Prepare', parser: 'none' as const, command: 'npm run prepare' },
    { label: 'Type check', parser: 'typescript' as const, command: 'npm run check -- --pretty false', shell: 'powershell' as const },
  ];
  run.stepCount = 2;
  run.activeStepIndex = 1;
  run.output = [
    ...runLines(['Unrelated preparation'], 'stdout'),
    ...runLines(['Checking types', '\u001b[31msrc/main.ts(7,3): error TS2322: Invalid type\u001b[0m', '    at check (src/check.ts:8:4)'], 'stderr', 1).map(
      (line) => ({ ...line, sequence: line.sequence + 10 }),
    ),
  ];
  return run;
};

describe('console problem to editable planner draft', () => {
  let host: HTMLDivElement;
  let root: Root;
  let activeRepo: string | null;
  let requestId: number;
  let run: ReturnType<typeof diagnosticRun>;

  const render = (language: AppLanguage = 'en') =>
    act(async () => {
      root.render(
        <I18nProvider language={language}>
          <QuickRepositoryTodoDialog requestId={requestId} activeRepo={activeRepo} />
          <RepositoryRunConsole run={run} onStop={vi.fn()} onBack={vi.fn()} />
        </I18nProvider>,
      );
    });
  const click = (label: string) =>
    act(async () => {
      const button = [...host.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === label);
      expect(button, label).toBeTruthy();
      button!.click();
    });
  const openDraft = async (language: AppLanguage = 'en') => {
    await render(language);
    await click(language === 'de' ? 'Probleme (1)' : 'Problems (1)');
    await click(language === 'de' ? 'Als Bug aufnehmen' : 'Add as bug');
  };
  const change = (element: HTMLInputElement | HTMLTextAreaElement, value: string) =>
    act(() => {
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    useRepositoryTodoDraftState.setState({ request: null });
    planner.data = { version: 1, projects: [project], items: [] };
    planner.createItem.mockResolvedValue(true);
    planner.createRepositoryProject.mockResolvedValue(project);
    activeRepo = project.repoPath;
    requestId = 0;
    run = diagnosticRun();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useRepositoryTodoDraftState.setState({ request: null });
  });

  it.each(['de', 'en'] as const)('opens a %s bug draft and saves only the reviewed, edited fields', async (language) => {
    await openDraft(language);
    const title = host.querySelector<HTMLInputElement>('.dialog-modal input')!;
    const description = host.querySelector<HTMLTextAreaElement>('.dialog-modal textarea')!;
    expect(title.value).toContain('TS2322: Invalid type');
    expect(description.value).toContain('src/main.ts:7:3');
    expect(description.value).toContain('npm run check -- --pretty false');
    expect(description.value).toContain('Checking types');
    expect(description.value).toContain('at check');
    expect(description.value).not.toContain('Unrelated preparation');
    expect(description.value).not.toContain('\u001b');
    expect(host.querySelectorAll('.dialog-modal select')[1]).toHaveProperty('value', 'bug');
    expect(host.querySelector('input[placeholder="Bug, Feature, UI"]')).toHaveProperty('value', 'Bug');
    expect(planner.createItem).not.toHaveBeenCalled();
    expect(planner.createRepositoryProject).not.toHaveBeenCalled();

    change(title, 'Investigate faulty type');
    const editedDescription = description.value + '\n\nReviewed reproduction steps';
    change(description, editedDescription);
    run = { ...run, output: [...run.output, ...runLines(['Later output']).map((line) => ({ ...line, sequence: 100 }))] };
    await render(language);
    expect(title.value).toBe('Investigate faulty type');
    await click(language === 'de' ? 'Eintrag anlegen' : 'Create item');

    expect(planner.createItem).toHaveBeenCalledExactlyOnceWith(project.id, {
      title: 'Investigate faulty type',
      description: editedDescription,
      priority: 'medium',
      status: 'bug',
      tags: ['Bug'],
    });
    expect(host.querySelector('.dialog-modal')).toBeNull();
  });

  it('discards the draft with Escape and starts a normal quick todo without stale bug data', async () => {
    await openDraft();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('.dialog-modal')).toBeNull();
    expect(planner.createItem).not.toHaveBeenCalled();

    requestId += 1;
    await render();
    expect(host.querySelector('.dialog-modal input')).toHaveProperty('value', '');
    expect(host.querySelector('.dialog-modal textarea')).toHaveProperty('value', '');
    expect(host.querySelectorAll('.dialog-modal select')[1]).toHaveProperty('value', 'idea');
  });

  it('keeps the bug draft through explicit creation of a missing repository project', async () => {
    planner.data = { version: 1, projects: [], items: [] };
    await openDraft();
    expect(host.textContent).toContain('Enable project planning for this repository?');
    expect(planner.createRepositoryProject).not.toHaveBeenCalled();
    await click('Add project');

    expect(planner.createRepositoryProject).toHaveBeenCalledExactlyOnceWith(project.repoPath);
    expect(host.querySelector('.dialog-modal textarea')).toHaveProperty('value', expect.stringContaining('npm run check -- --pretty false'));
    expect(host.querySelectorAll('.dialog-modal select')[1]).toHaveProperty('value', 'bug');
    expect(planner.createItem).not.toHaveBeenCalled();
  });

  it('closes the draft on repository change and rejects diagnostics from the previous repository', async () => {
    await openDraft();
    activeRepo = 'D:/other-repository';
    await render();
    expect(host.querySelector('.dialog-modal')).toBeNull();
    await click('Add as bug');

    expect(host.querySelector('.dialog-modal')).toBeNull();
    expect(planner.notify).toHaveBeenCalledWith('Please open the associated repository first.', true);
    expect(planner.createItem).not.toHaveBeenCalled();
  });

  it('does not reopen a cancelled draft when project creation finishes late', async () => {
    planner.data = { version: 1, projects: [], items: [] };
    let resolveProject!: (value: typeof project) => void;
    planner.createRepositoryProject.mockReturnValue(
      new Promise<typeof project>((resolve) => {
        resolveProject = resolve;
      }),
    );
    await openDraft();
    await click('Add project');
    await click('Cancel');
    await act(async () => resolveProject(project));

    expect(host.querySelector('.dialog-modal')).toBeNull();
    expect(planner.createItem).not.toHaveBeenCalled();
  });
});
