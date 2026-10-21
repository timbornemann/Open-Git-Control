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

  const originalViewport = { width: window.innerWidth, height: window.innerHeight };

  const render = (point = { x: 40, y: 40 }) => {
    act(() => {
      root.render(
        createElement(
          I18nProvider,
          { language: 'de' },
          createElement(PlannerItemContextMenu, {
            contextMenu: { ...point, item },
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

  const getButton = (text: string) => Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes(text));

  const mockMenuLayout = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return Math.min(this.classList.contains('planner-item-context-submenu') ? 184 : 232, width - 16);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      const desiredHeight = this.classList.contains('planner-item-context-submenu') ? (this.querySelectorAll('button').length === 6 ? 190 : 130) : 224;
      return Math.min(desiredHeight, height - 16);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const menu = this.closest<HTMLElement>('.planner-item-context-menu');
      const left = Number.parseFloat(menu?.style.left || '0');
      const top = Number.parseFloat(menu?.style.top || '0') + (this.textContent?.includes('Status aendern') ? 137 : 107) - (menu?.scrollTop || 0);
      return { left, top, right: left + (menu?.offsetWidth || 0), bottom: top + 30 } as DOMRect;
    });
  };

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
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalViewport.width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalViewport.height });
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

  it.each([
    { width: 500, height: 350, x: 490, y: 340 },
    { width: 500, height: 350, x: 20, y: 20 },
    { width: 200, height: 120, x: 195, y: 115 },
  ])('keeps both menus inside a $width x $height window at ($x, $y)', ({ width, height, x, y }) => {
    mockMenuLayout(width, height);
    render({ x, y });
    act(() => getButton('Status aendern')!.focus());

    const menu = document.querySelector<HTMLElement>('.planner-item-context-menu')!;
    const submenu = document.querySelector<HTMLElement>('.planner-item-context-submenu')!;
    for (const element of [menu, submenu]) {
      const left = Number.parseFloat(element.style.left);
      const top = Number.parseFloat(element.style.top);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(left + element.offsetWidth).toBeLessThanOrEqual(width - 8);
      expect(top + element.offsetHeight).toBeLessThanOrEqual(height - 8);
    }
    expect(submenu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(6);
    expect(submenu.closest('.planner-item-context-menu')).toBe(menu);

    act(() => getButton('Erledigt')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(onClose).not.toHaveBeenCalled();
    act(() => getButton('Erledigt')!.click());
    expect(onChangeStatus).toHaveBeenCalledWith(item.id, 'done');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('flips left near the right edge and repositions when switching to a taller submenu', () => {
    mockMenuLayout(500, 350);
    render({ x: 490, y: 340 });
    act(() => getButton('Prioritaet aendern')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    const menu = document.querySelector<HTMLElement>('.planner-item-context-menu')!;
    const priorityMenu = document.querySelector<HTMLElement>('.planner-item-context-submenu')!;
    expect(Number.parseFloat(priorityMenu.style.left)).toBeLessThan(Number.parseFloat(menu.style.left));
    const priorityTop = Number.parseFloat(priorityMenu.style.top);

    act(() => getButton('Status aendern')!.focus());
    const statusMenu = document.querySelector<HTMLElement>('.planner-item-context-submenu')!;
    expect(Number.parseFloat(statusMenu.style.top)).toBeLessThan(priorityTop);
    expect(Number.parseFloat(statusMenu.style.top) + statusMenu.offsetHeight).toBe(342);
  });

  it('escapes transformed and clipped panels and repositions the flyout when its parent scrolls', () => {
    host.style.transform = 'translateY(1px)';
    host.style.overflow = 'hidden';
    mockMenuLayout(500, 600);
    render();
    act(() => getButton('Status aendern')!.focus());
    const backdrop = document.querySelector('.planner-item-context-backdrop')!;
    expect(backdrop.parentElement).toBe(document.body);
    expect(host.contains(backdrop)).toBe(false);

    const submenu = document.querySelector<HTMLElement>('.planner-item-context-submenu')!;
    const previousTop = Number.parseFloat(submenu.style.top);
    act(() => {
      const menu = document.querySelector<HTMLElement>('.planner-item-context-menu')!;
      menu.scrollTop = 40;
      menu.dispatchEvent(new Event('scroll'));
    });
    expect(Number.parseFloat(submenu.style.top)).toBe(previousTop - 40);
    expect(onChangeStatus).not.toHaveBeenCalled();
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
