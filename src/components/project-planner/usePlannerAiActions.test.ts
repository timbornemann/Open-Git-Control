// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmDialogState } from '@/app/state/contracts';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { Confirm } from '@/components/Confirm';
import { clearCommitFormDraftsForTests, getCommitFormDraft, updateCommitFormDraft } from '@/components/staging-area/commitFormDraft';
import { I18nProvider, type AppLanguage } from '@/i18n';
import { aiClient } from '@/services/aiClient';
import { copyTextToClipboard } from '@/utils/clipboard';
import { openStagingCommitArea } from '@/utils/layoutPreferences';
import { usePlannerAiActions } from './usePlannerAiActions';

vi.mock('@/services/aiClient', () => ({
  aiClient: {
    isAvailable: vi.fn(),
    generateCommitMessage: vi.fn(),
  },
}));

vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: vi.fn() }));
vi.mock('@/utils/layoutPreferences', () => ({ openStagingCommitArea: vi.fn() }));

const project = {
  id: 'project-1',
  name: 'Open Git Control',
  description: '',
  kind: 'repository' as const,
  repoPath: 'C:/Repos/Open-Git-Control',
  createdAt: 1,
  updatedAt: 1,
};

const item = {
  id: 'item-1',
  projectId: project.id,
  title: 'Fix copy detection',
  description: 'Support copied paths.',
  priority: 'high' as const,
  status: 'bug' as const,
  tags: ['git'],
  createdAt: 1,
  updatedAt: 1,
};

describe('usePlannerAiActions', () => {
  let host: HTMLDivElement;
  let root: Root;
  let actions: ReturnType<typeof usePlannerAiActions> | null = null;
  const notify = vi.fn();
  const activateRepositoryProject = vi.fn();
  const markItemsDone = vi.fn();
  const setConfirmDialog = vi.fn();

  const render = (language: AppLanguage = 'de') => {
    const Harness = () => {
      const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
      actions = usePlannerAiActions({
        project,
        settings: { ...DEFAULT_SETTINGS, aiCommitMessageLanguage: 'en' },
        activateRepositoryProject,
        markItemsDone,
        notify,
        setConfirmDialog: (value) => {
          setConfirmDialog(value);
          setDialog(value);
        },
      });
      return dialog
        ? createElement(Confirm, {
            ...dialog,
            open: true,
            onConfirm: () => {
              setDialog(null);
              void dialog.onConfirm();
            },
            onCancel: () => setDialog(null),
          })
        : null;
    };
    act(() => root.render(createElement(I18nProvider, { language, children: createElement(Harness) })));
  };

  const flush = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    clearCommitFormDraftsForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    actions = null;
    notify.mockReset();
    activateRepositoryProject.mockReset().mockResolvedValue(true);
    markItemsDone.mockReset().mockResolvedValue(undefined);
    setConfirmDialog.mockReset();
    vi.mocked(copyTextToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(openStagingCommitArea).mockReset();
    vi.mocked(aiClient.isAvailable).mockReset().mockReturnValue(true);
    vi.mocked(aiClient.generateCommitMessage)
      .mockReset()
      .mockResolvedValue({ success: true, data: { title: 'fix(git): support copied paths', description: 'Keeps copied paths aligned.' } });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('copies a prompt for the selected todo item', async () => {
    render();

    await act(async () => {
      await actions!.copyItemPrompt(item);
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith(expect.stringContaining('<title>Fix copy detection</title>'));
    expect(notify).toHaveBeenCalledWith('Agent-Prompt kopiert.', false);
  });

  it('reports a clipboard failure without changing the todo', async () => {
    vi.mocked(copyTextToClipboard).mockResolvedValue(false);
    render();

    await act(async () => {
      await actions!.copyItemPrompt(item);
    });

    expect(notify).toHaveBeenCalledWith('Agent-Prompt konnte nicht kopiert werden.', true);
  });

  it('orders visible status items by priority before copying their prompt', async () => {
    render();

    await act(async () => {
      await actions!.copyStatusPrompt([
        { ...item, title: 'Low priority', priority: 'low' },
        { ...item, title: 'Urgent priority', priority: 'urgent' },
        { ...item, title: 'High priority', priority: 'high' },
      ]);
    });

    const prompt = vi.mocked(copyTextToClipboard).mock.calls[0]?.[0] || '';
    expect(prompt.indexOf('<title>Urgent priority</title>')).toBeLessThan(prompt.indexOf('<title>High priority</title>'));
    expect(prompt.indexOf('<title>High priority</title>')).toBeLessThan(prompt.indexOf('<title>Low priority</title>'));
  });

  it('generates a commit message, stores it as a draft, opens staging, and completes the selected todo', async () => {
    render();

    act(() => actions!.generateCommitMessageForItem(item));
    await flush();

    expect(aiClient.generateCommitMessage).toHaveBeenCalledWith({ notes: expect.stringContaining('Title: Fix copy detection') });
    expect(activateRepositoryProject).toHaveBeenCalledWith(project.repoPath);
    expect(getCommitFormDraft(project.repoPath, '')).toEqual({
      commitMsg: 'fix(git): support copied paths',
      commitDescription: 'Keeps copied paths aligned.',
      subject: { type: 'fix', scope: 'git', message: 'support copied paths' },
    });
    expect(openStagingCommitArea).toHaveBeenCalledOnce();
    expect(markItemsDone).toHaveBeenCalledWith([item]);
  });

  it('requires confirmation before completing every visible todo supplied to a status action', async () => {
    render();
    const visibleItems = [
      { ...item, id: 'item-urgent', title: 'Urgent priority', priority: 'urgent' as const },
      { ...item, id: 'item-high', title: 'High priority', priority: 'high' as const },
    ];

    act(() => actions!.generateCommitMessageForStatus(visibleItems));

    expect(aiClient.generateCommitMessage).not.toHaveBeenCalled();
    expect(markItemsDone).not.toHaveBeenCalled();
    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog.message).toContain('2 sichtbaren Einträge');
    expect(dialog.message).toContain('2 unverknüpfte Einträge');
    expect(dialog.contextItems).toContainEqual({ label: 'Betroffene Eintraege', value: 'Urgent priority, High priority' });
    await act(async () => {
      await dialog.onConfirm();
    });
    await flush();

    expect(aiClient.generateCommitMessage).toHaveBeenCalledOnce();
    expect(markItemsDone).toHaveBeenCalledWith(visibleItems);
  });
  it('separates linked and unlinked counts in the bulk confirmation', () => {
    render();
    const linked = {
      ...item,
      references: {
        activeWorkflowId: 'workflow',
        branches: [
          {
            id: 'workflow',
            projectId: item.projectId,
            name: 'task/work',
            baseRef: 'refs/heads/main',
            baseSha: 'a'.repeat(40),
            startedAt: 1,
            automationPaused: false,
          },
        ],
        pullRequests: [],
      },
    };
    act(() => actions!.generateCommitMessageForStatus([item, linked]));
    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog.message).toContain('1 unverknüpfte Einträge');
    expect(dialog.message).toContain('1 verknüpfte Einträge warten auf den PR-Merge');
    expect(aiClient.generateCommitMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['de', 'cancel'],
    ['en', 'escape'],
  ] as const)('leaves todos and the commit draft unchanged when a %s status confirmation is closed with %s', async (language, closeAction) => {
    const original = updateCommitFormDraft(project.repoPath, { commitMsg: 'Keep this draft' });
    render(language);

    act(() => actions!.generateCommitMessageForStatus([item]));
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.textContent).toContain(language === 'de' ? '1 sichtbaren Einträge' : '1 visible items');
    expect(host.textContent).toContain(language === 'de' ? 'erledigt' : 'done');
    act(() => {
      if (closeAction === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else host.querySelector<HTMLButtonElement>('.dialog-btn-secondary')!.click();
    });
    await flush();

    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(aiClient.generateCommitMessage).not.toHaveBeenCalled();
    expect(activateRepositoryProject).not.toHaveBeenCalled();
    expect(markItemsDone).not.toHaveBeenCalled();
    expect(getCommitFormDraft(project.repoPath, '')).toEqual(original);
  });

  it('confirms completing status items and replacing an existing draft in a single dialog', async () => {
    updateCommitFormDraft(project.repoPath, { commitMsg: 'Existing draft' });
    render();

    act(() => actions!.generateCommitMessageForStatus([item]));
    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog.contextItems).toContainEqual({ label: 'Aktueller Titel', value: 'Existing draft' });
    expect(dialog.consequences).toContain('ersetzt');
    expect(aiClient.generateCommitMessage).not.toHaveBeenCalled();

    act(() => host.querySelector<HTMLButtonElement>('.dialog-btn-primary')!.click());
    await flush();

    expect(setConfirmDialog).toHaveBeenCalledOnce();
    expect(aiClient.generateCommitMessage).toHaveBeenCalledOnce();
    expect(markItemsDone).toHaveBeenCalledWith([item]);
    expect(getCommitFormDraft(project.repoPath, '').commitMsg).toBe('fix(git): support copied paths');
  });

  it('does not complete todos when generating the AI commit message fails', async () => {
    vi.mocked(aiClient.generateCommitMessage).mockResolvedValue({ success: false, error: 'AI unavailable' });
    render();

    act(() => actions!.generateCommitMessageForItem(item));
    await flush();

    expect(markItemsDone).not.toHaveBeenCalled();
  });

  it.each([
    { commitMsg: 'existing draft' },
    { subject: { type: 'fix' as const, scope: '', message: '' } },
    { subject: { type: 'fix' as const, scope: 'backend', message: '' } },
  ])('requires confirmation before replacing a non-empty or unfinished draft: %j', async (patch) => {
    const original = updateCommitFormDraft(project.repoPath, patch);
    render();

    act(() => actions!.generateCommitMessageForItem(item));

    expect(aiClient.generateCommitMessage).not.toHaveBeenCalled();
    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog.title).toBe('Commit-Entwurf ersetzen?');
    expect(getCommitFormDraft(project.repoPath, '')).toEqual(original);
    await dialog.onConfirm();
    await flush();
    expect(aiClient.generateCommitMessage).toHaveBeenCalledOnce();
  });
});
