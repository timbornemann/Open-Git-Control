// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemDialog } from './PlannerDialogs';

const item = {
  id: 'item-1',
  projectId: 'project-1',
  title: 'Fix timeline parsing',
  description: 'Handle copied paths.',
  priority: 'high' as const,
  status: 'bug' as const,
  tags: ['git'],
  createdAt: 1,
  updatedAt: 1,
};

describe('ItemDialog AI actions', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('offers copy and AI commit actions for a repository todo', async () => {
    const onCopyAgentPrompt = vi.fn();
    const onGenerateCommitMessage = vi.fn();

    await act(async () => {
      root.render(
        createElement(ItemDialog, {
          open: true,
          item,
          busy: false,
          onClose: vi.fn(),
          onSubmit: vi.fn(),
          onCopyAgentPrompt,
          onGenerateCommitMessage,
        }),
      );
    });

    const buttons = Array.from(host.querySelectorAll('button'));
    const copyButton = buttons.find((button) => button.textContent?.includes('Agent-Prompt kopieren'));
    const commitButton = buttons.find((button) => button.textContent?.includes('KI-Commit-Nachricht'));
    expect(copyButton).toBeTruthy();
    expect(commitButton).toBeTruthy();

    act(() => copyButton?.click());
    expect(onCopyAgentPrompt).toHaveBeenCalledWith(expect.objectContaining({ title: item.title, description: item.description }));
  });

  it('does not render the commit action when no repository action is supplied', async () => {
    await act(async () => {
      root.render(
        createElement(ItemDialog, {
          open: true,
          item,
          busy: false,
          onClose: vi.fn(),
          onSubmit: vi.fn(),
          onCopyAgentPrompt: vi.fn(),
        }),
      );
    });

    expect(host.textContent).toContain('Agent-Prompt kopieren');
    expect(host.textContent).not.toContain('KI-Commit-Nachricht');
  });
});
