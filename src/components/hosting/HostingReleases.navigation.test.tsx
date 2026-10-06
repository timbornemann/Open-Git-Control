// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateSlicesProvider, type AppStateSlicesValue } from '@/contexts/AppStateContext';
import { I18nProvider } from '@/i18n';
import { HostingReleases } from './HostingReleases';
import type { HostedRepository, HostingCapabilities } from '@/types/hostingDtos';

vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: async () => ({ items: [], nextCursor: null }) } }));
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
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe('hosting creator navigation', () => {
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
