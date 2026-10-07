// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateSlicesProvider, type AppStateSlicesValue } from '@/contexts/AppStateContext';
import { I18nProvider } from '@/i18n';
import { HostingReleases } from './HostingReleases';
import type { HostedRepository, HostingCapabilities } from '@/types/hostingDtos';
import { useHostingState } from './hostingState';

const requests = vi.hoisted(() => vi.fn());
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: requests } }));
const repository: HostedRepository = {
  ref: { connectionId: 'selected', repositoryId: '1', fullPath: 'team/repo' },
  name: 'repo',
  fullName: 'team/repo',
  description: null,
  htmlUrl: 'https://forge.example/team/repo',
  cloneUrl: 'https://forge.example/team/repo.git',
  defaultBranch: 'main',
  private: true,
  fork: false,
};
const capabilities = { releases: 'native', releaseAssets: true } as HostingCapabilities;
let root: Root;
let host: HTMLDivElement;
let allowActivation: boolean;
const openCreator = vi.fn();
const activate = vi.fn();
const openFolder = vi.fn();
const clone = vi.fn();
function Harness({ paths }: { paths: string[] }) {
  const [activeRepo, setActiveRepo] = useState('C:/unrelated');
  const state = {
    settings: {},
    workflow: {},
    ui: { onOpenReleaseCreator: openCreator },
    repository: {
      activeRepo,
      onOpenFolder: openFolder,
      onSwitchRepo: async (path: string) => {
        activate(path);
        if (!allowActivation) return false;
        setActiveRepo(path);
        return true;
      },
    },
  } as unknown as AppStateSlicesValue;
  return (
    <I18nProvider language="en">
      <AppStateSlicesProvider value={state}>
        <HostingReleases repository={repository} capabilities={capabilities} repoPath={null} localPaths={paths} onClone={clone} />
      </AppStateSlicesProvider>
    </I18nProvider>
  );
}
const render = async (paths: string[]) => act(async () => root.render(<Harness paths={paths} />));
const create = async () =>
  act(async () => {
    host.querySelector<HTMLButtonElement>('.ui-button--primary')!.click();
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  allowActivation = true;
  vi.clearAllMocks();
  requests.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  useHostingState.setState({ revision: 0 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe('hosting creator navigation', () => {
  it('loads more release history and refreshes the selected endpoint without starting the creator', async () => {
    const release = (id: string) => ({
      id,
      tagName: `v${id}`,
      name: `Version ${id}`,
      body: `## Notes ${id}`,
      draft: false,
      prerelease: false,
      htmlUrl: `${repository.htmlUrl}/releases/${id}`,
    });
    requests
      .mockResolvedValueOnce({ items: [release('2')], nextCursor: 'older' })
      .mockResolvedValueOnce({ items: [release('1')], nextCursor: null })
      .mockResolvedValueOnce({ items: [release('3')], nextCursor: null });
    await render(['C:/selected-clone']);
    const click = (label: string) => act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)!.click());
    await click('Load more');
    expect(requests).toHaveBeenCalledWith('releases', { repository: repository.ref, cursor: 'older' });
    expect(host.querySelectorAll('.hosting-release')).toHaveLength(2);
    await click('Refresh');
    expect(requests).toHaveBeenLastCalledWith('releases', { repository: repository.ref });
    expect(host.querySelectorAll('.hosting-release')).toHaveLength(1);
    expect(host.querySelector('.markdown-preview-content h2')?.textContent).toBe('Notes 3');
    expect(openCreator).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('keeps failed loading distinct from an empty release history', async () => {
    requests.mockRejectedValueOnce(new Error('Release access denied'));
    await render(['C:/selected-clone']);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Release access denied');
    expect(host.querySelector('.hosting-releases-empty')).toBeNull();
    requests.mockResolvedValueOnce({ items: [], nextCursor: null });
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Refresh')!.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('.hosting-releases-empty')?.textContent).toContain('No releases yet');
  });

  it('opens the explicit hosting repository only after its local clone has been activated and React has committed that context', async () => {
    await render(['C:/selected-clone']);
    await create();
    expect(activate).toHaveBeenCalledWith('C:/selected-clone');
    expect(openCreator).toHaveBeenCalledWith(repository.ref);
  });
  it('does not open the creator when the existing navigation guard cancels repository activation', async () => {
    allowActivation = false;
    await render(['C:/selected-clone']);
    await create();
    expect(activate).toHaveBeenCalled();
    expect(openCreator).not.toHaveBeenCalled();
  });
  it('requires an explicit clone choice when multiple local clones exist', async () => {
    await render(['C:/clone-one', 'C:/clone-two']);
    expect(host.querySelector<HTMLButtonElement>('.ui-button--primary')!.disabled).toBe(true);
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = 'C:/clone-two';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await create();
    expect(activate).toHaveBeenCalledWith('C:/clone-two');
    expect(openCreator).toHaveBeenCalledWith(repository.ref);
  });
  it('offers clone and local open actions when there is no local clone, without a simplified release form', async () => {
    await render([]);
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('.ui-button--primary')).toBeNull();
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Clone to create'))!.click());
    expect(clone).toHaveBeenCalledWith(repository);
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Open local repository'))!.click());
    expect(openFolder).toHaveBeenCalled();
    expect(openCreator).not.toHaveBeenCalled();
  });
});
