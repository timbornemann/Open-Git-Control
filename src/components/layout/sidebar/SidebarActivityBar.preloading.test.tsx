// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadViewModule } from '@/data/viewModules';
import { SidebarActivityBar } from './SidebarActivityBar';

vi.mock('@/data/viewModules', () => ({ preloadViewModule: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, tr: (_de: string, en: string) => en }) }));
vi.mock('./UpdateNotification', () => ({ UpdateNotification: () => null }));
vi.mock('./RepositoryActivityRail', () => ({ RepositoryActivityRail: () => null }));
vi.mock('@/components/system-tools/SystemToolsWarning', () => ({ SystemToolsWarning: () => null }));

describe('navigation intent view preloading', () => {
  let host: HTMLDivElement;
  let root: Root;
  const navigate = vi.fn();
  const toggle = vi.fn();
  const button = (title: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.title === title)!;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<SidebarActivityBar activeTab="repo" setActiveTab={navigate} isSidebarCollapsed={false} onToggleSidebar={toggle} />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('does not start loading inactive views merely by rendering the menu', () => {
    expect(preloadViewModule).not.toHaveBeenCalled();
  });

  it.each([
    ['sidebar.currentRepository', 'repo'],
    ['Statistics & analytics', 'analytics'],
    ['sidebar.planner', 'planner'],
    ['Hosting', 'hosting'],
    ['sidebar.settings', 'settings'],
  ])('prepares %s on hover without changing the active page', (title, name) => {
    act(() => button(title).dispatchEvent(new Event('pointerover', { bubbles: true })));
    expect(preloadViewModule).toHaveBeenCalledExactlyOnceWith(name);
    expect(navigate).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
  });

  it('prepares the focused page for keyboard navigation before activation', () => {
    act(() => button('Hosting').focus());
    expect(preloadViewModule).toHaveBeenCalledExactlyOnceWith('hosting');
    expect(navigate).not.toHaveBeenCalled();
    act(() => button('Hosting').click());
    expect(navigate).toHaveBeenCalledExactlyOnceWith('hosting');
  });

  it('leaves already eager local repository navigation available without speculative imports', () => {
    act(() => button('sidebar.localRepos').focus());
    act(() => button('sidebar.localRepos').click());
    expect(preloadViewModule).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('localRepos');
  });
});
