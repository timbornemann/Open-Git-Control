// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmDialogState } from '@/app/state/contracts';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { clearCommitFormDraftsForTests, getCommitFormDraft, updateCommitFormDraft } from '@/components/staging-area/commitFormDraft';
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
  title: 'Fix copy detection',
  description: 'Support copied paths.',
  priority: 'high' as const,
  status: 'bug' as const,
  tags: ['git'],
};

describe('usePlannerAiActions', () => {
  let host: HTMLDivElement;
  let root: Root;
  let actions: ReturnType<typeof usePlannerAiActions> | null = null;
  const notify = vi.fn();
  const activateRepositoryProject = vi.fn();
  const setConfirmDialog = vi.fn();

  const render = () => {
    const Harness = () => {
      actions = usePlannerAiActions({
        project,
        settings: { ...DEFAULT_SETTINGS, aiCommitMessageLanguage: 'en' },
        activateRepositoryProject,
        notify,
        setConfirmDialog,
      });
      return null;
    };
    act(() => root.render(createElement(Harness)));
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

  it('generates a commit message, stores it as a draft, and opens staging', async () => {
    render();

    act(() => actions!.generateCommitMessageForItem(item));
    await flush();

    expect(aiClient.generateCommitMessage).toHaveBeenCalledWith({ notes: expect.stringContaining('Title: Fix copy detection') });
    expect(activateRepositoryProject).toHaveBeenCalledWith(project.repoPath);
    expect(getCommitFormDraft(project.repoPath, '')).toEqual({
      commitMsg: 'fix(git): support copied paths',
      commitDescription: 'Keeps copied paths aligned.',
    });
    expect(openStagingCommitArea).toHaveBeenCalledOnce();
  });

  it('requires confirmation before replacing a non-empty commit draft', async () => {
    updateCommitFormDraft(project.repoPath, { commitMsg: 'existing draft' });
    render();

    act(() => actions!.generateCommitMessageForItem(item));

    expect(aiClient.generateCommitMessage).not.toHaveBeenCalled();
    const dialog = setConfirmDialog.mock.calls[0]?.[0] as ConfirmDialogState;
    expect(dialog.title).toBe('Commit-Entwurf ersetzen?');
    await dialog.onConfirm();
    await flush();
    expect(aiClient.generateCommitMessage).toHaveBeenCalledOnce();
  });
});
