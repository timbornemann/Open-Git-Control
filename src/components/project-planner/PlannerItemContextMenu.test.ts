// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { PlannerItemContextMenu } from './PlannerItemContextMenu';

const item = {
  id: 'item-1',
  projectId: 'project-1',
  title: 'Fix copy detection',
  description: 'Support copied paths.',
  priority: 'high' as const,
  status: 'bug' as const,
  tags: ['git'],
  createdAt: 1,
  updatedAt: 1,
};

describe('PlannerItemContextMenu', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onClose = vi.fn();
  const onCopyAgentPrompt = vi.fn();
  const onGenerateCommitMessage = vi.fn();
  const onChangePriority = vi.fn();
  const onChangeStatus = vi.fn();
  const onDelete = vi.fn();

  const render = () => {
    act(() => {
      root.render(
        createElement(
          I18nProvider,
          { language: 'de' },
          createElement(PlannerItemContextMenu, {
            contextMenu: { x: 40, y: 40, item },
            busy: false,
            canGenerateCommitMessage: true,
            isAiCommitGenerating: false,
            onClose,
            onCopyAgentPrompt,
            onGenerateCommitMessage,
            onChangePriority,
            onChangeStatus,
            onDelete,
          }),
        ),
      );
    });
  };

  const getButton = (text: string) => Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes(text));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    onClose.mockReset();
    onCopyAgentPrompt.mockReset();
    onGenerateCommitMessage.mockReset();
    onChangePriority.mockReset();
    onChangeStatus.mockReset();
    onDelete.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('offers AI actions and deletion from the item context menu', () => {
    render();

    expect(getButton('Agent-Prompt kopieren')).toBeTruthy();
    expect(getButton('KI-Commit-Nachricht erstellen')).toBeTruthy();
    expect(getButton('Todo loeschen')).toBeTruthy();

    act(() => getButton('Agent-Prompt kopieren')?.click());
    expect(onCopyAgentPrompt).toHaveBeenCalledWith(item);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('changes priority and status from their flyout menus', () => {
    render();

    act(() => getButton('Prioritaet aendern')?.focus());
    act(() => getButton('Dringend')?.click());
    expect(onChangePriority).toHaveBeenCalledWith(item.id, 'urgent');

    act(() => getButton('Status aendern')?.focus());
    act(() => getButton('Erledigt')?.click());
    expect(onChangeStatus).toHaveBeenCalledWith(item.id, 'done');
  });

  it('hides the AI commit action for todos without a repository', () => {
    act(() => {
      root.render(
        createElement(
          I18nProvider,
          { language: 'de' },
          createElement(PlannerItemContextMenu, {
            contextMenu: { x: 40, y: 40, item },
            busy: false,
            canGenerateCommitMessage: false,
            isAiCommitGenerating: false,
            onClose,
            onCopyAgentPrompt,
            onGenerateCommitMessage,
            onChangePriority,
            onChangeStatus,
            onDelete,
          }),
        ),
      );
    });

    expect(getButton('KI-Commit-Nachricht erstellen')).toBeUndefined();
  });
});
