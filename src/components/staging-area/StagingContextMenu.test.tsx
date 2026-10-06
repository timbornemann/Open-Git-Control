// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { FileEntry } from '@/utils/gitParsing';
import { StagingContextMenu } from './StagingContextMenu';
import type { useFileOperations } from './useFileOperations';
import type { StagingContextMenuState } from './types';

const entry: FileEntry = { path: 'deep/nested/folder/report_wpftmp.csproj', x: '?', y: '?' };

const createFileOps = () =>
  ({
    isMutating: false,
    setContextMenu: vi.fn(),
    openRepositoryPath: vi.fn(),
    stashFile: vi.fn(),
    stashAll: vi.fn(),
    addIgnoreRule: vi.fn(),
  }) as unknown as ReturnType<typeof useFileOperations>;

describe('StagingContextMenu', () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalOffsetWidth: PropertyDescriptor | undefined;
  let originalOffsetHeight: PropertyDescriptor | undefined;
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  const stubMenuSize = (width: number, height: number) => {
    Object.defineProperty(HTMLDivElement.prototype, 'offsetWidth', { configurable: true, value: width });
    Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', { configurable: true, value: height });
  };

  const render = (contextMenu: StagingContextMenuState, fileOps = createFileOps()) => {
    act(() => {
      root.render(createElement(I18nProvider, { language: 'de', children: createElement(StagingContextMenu, { contextMenu, fileOps }) }));
    });
    return fileOps;
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'offsetWidth');
    originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'offsetHeight');
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
  });

  it('offers separate checked LFS actions and retains keyboard navigation and file opening', () => {
    const fileOps = createFileOps();
    const state = { eligible: true, extension: '.psd', configured: false, pointer: false };
    fileOps.lfs = { available: true, loading: false, stateFor: vi.fn(() => state), track: vi.fn() } as any;
    fileOps.trackFileTypeWithLfs = vi.fn();
    const contextMenu: StagingContextMenuState = { x: 10, y: 10, entry: { path: 'design.psd', x: 'A', y: ' ' }, section: 'staged' };
    render(contextMenu, fileOps);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
    act(() => buttons[0].click());
    expect(fileOps.lfs.track).toHaveBeenCalledWith(contextMenu.entry, 'staged', 'file');
    act(() => buttons[1].click());
    expect(fileOps.trackFileTypeWithLfs).toHaveBeenCalledWith(contextMenu.entry, 'staged');
    expect(buttons.some((button) => button.textContent?.includes('Datei oeffnen'))).toBe(true);
    buttons[0].focus();
    act(() => buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).toBe(buttons[1]);
    act(() => buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(fileOps.setContextMenu).toHaveBeenCalledWith(null);
  });

  it('explains unavailable Git LFS and offers its installation page without allowing conversion', () => {
    const fileOps = createFileOps();
    fileOps.lfs = {
      available: false,
      loading: false,
      error: 'Git LFS is not installed',
      stateFor: () => ({ eligible: true, extension: '.psd' }),
      track: vi.fn(),
    } as any;
    render({ x: 10, y: 10, entry, section: 'untracked' }, fileOps);
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].disabled).toBe(true);
    expect(host.textContent).toContain('Git LFS is not installed');
    expect(host.textContent).toContain('Git LFS installieren');
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    if (originalOffsetWidth) Object.defineProperty(HTMLDivElement.prototype, 'offsetWidth', originalOffsetWidth);
    if (originalOffsetHeight) Object.defineProperty(HTMLDivElement.prototype, 'offsetHeight', originalOffsetHeight);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
  });

  it('keeps the menu fully on-screen when a file near the bottom-right edge is right-clicked', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
    stubMenuSize(240, 320);

    render({ x: 980, y: 690, entry, section: 'untracked' });

    const menu = host.querySelector<HTMLElement>('.ctx-menu');
    if (!menu) throw new Error('Missing context menu.');
    const left = Number.parseFloat(menu.style.left);
    const top = Number.parseFloat(menu.style.top);

    // The raw click point (980, 690) is far past where a 240x320 menu could
    // fit without being clipped by the viewport (1000x700); the position must
    // be pulled back so the whole menu stays visible.
    expect(left).toBeLessThanOrEqual(1000 - 240);
    expect(top).toBeLessThanOrEqual(700 - 320);
    expect(left).not.toBe(980);
    expect(top).not.toBe(690);
  });

  it('keeps the menu anchored at the click point when there is enough room', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    stubMenuSize(240, 320);

    render({ x: 100, y: 120, entry, section: 'untracked' });

    const menu = host.querySelector<HTMLElement>('.ctx-menu');
    if (!menu) throw new Error('Missing context menu.');
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('120px');
  });

  it('closes and forwards the entry path when an action is clicked', () => {
    stubMenuSize(240, 320);
    const fileOps = render({ x: 20, y: 20, entry, section: 'untracked' });

    const openButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Datei oeffnen'));
    if (!openButton) throw new Error('Missing open-file action.');
    act(() => openButton.click());

    expect(fileOps.openRepositoryPath).toHaveBeenCalledWith(entry.path, 'open');
    expect(fileOps.setContextMenu).toHaveBeenCalledWith(null);
  });
});
