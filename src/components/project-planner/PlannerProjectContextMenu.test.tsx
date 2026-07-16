// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { PlannerProjectContextMenu } from './PlannerProjectContextMenu';

const project = {
  id: 'project-1',
  name: 'Desktop app',
  description: '',
  kind: 'planned' as const,
  repoPath: null,
  createdAt: 1,
  updatedAt: 1,
};

describe('PlannerProjectContextMenu', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onClose = vi.fn();
  const onCreateItem = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  const render = () => {
    act(() => {
      root.render(
        createElement(I18nProvider, {
          language: 'de',
          children: createElement(PlannerProjectContextMenu, {
            contextMenu: { x: 40, y: 40, project },
            busy: false,
            onClose,
            onCreateItem,
            onEdit,
            onDelete,
          }),
        }),
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
    onCreateItem.mockReset();
    onEdit.mockReset();
    onDelete.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('offers todo creation, project editing, and deletion without opening the project first', () => {
    render();

    expect(getButton('Todo erstellen')).toBeTruthy();
    expect(getButton('Projekt bearbeiten')).toBeTruthy();
    expect(getButton('Projektidee loeschen')).toBeTruthy();

    act(() => getButton('Todo erstellen')?.click());
    expect(onCreateItem).toHaveBeenCalledWith(project.id);
    expect(onClose).toHaveBeenCalledOnce();

    render();
    act(() => getButton('Projekt bearbeiten')?.click());
    expect(onEdit).toHaveBeenCalledWith(project.id);

    render();
    act(() => getButton('Projektidee loeschen')?.click());
    expect(onDelete).toHaveBeenCalledWith(project.id);
  });
});
