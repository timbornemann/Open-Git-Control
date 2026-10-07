// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { HostedRepositoryRef, HostingRelease } from '@/types/hostingDtos';
import { HostingReleaseList } from './HostingReleaseList';

const mocks = vi.hoisted(() => ({ request: vi.fn(), openExternal: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/services/appClient', () => ({ appClient: { isAvailable: () => true, openExternalUrl: mocks.openExternal } }));

const repository: HostedRepositoryRef = { connectionId: 'forgejo', repositoryId: '42', fullPath: 'team/app' };
const release = (overrides: Partial<HostingRelease> = {}): HostingRelease => ({
  id: 'release-1',
  tagName: 'v2.2.2',
  name: 'Release v2.2.2',
  draft: false,
  prerelease: false,
  htmlUrl: 'https://forge.example/team/app/releases/tag/v2.2.2',
  publishedAt: '2026-10-07T09:00:00Z',
  ...overrides,
});
let host: HTMLDivElement;
let root: Root;
const render = (releases: HostingRelease[], showAssets = false, ref = repository) =>
  act(async () => {
    root.render(
      <I18nProvider language="en">
        <HostingReleaseList repository={ref} releases={releases} showAssets={showAssets} />
      </I18nProvider>,
    );
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.request.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mocks.openExternal.mockReset().mockResolvedValue({ success: true });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('hosting release history', () => {
  it('renders published Markdown, including tables and code, and safely opens links through the app', async () => {
    await render([
      release({
        body: [
          '## Improvements',
          '',
          '- **Preview** in the release creator',
          '',
          '| Area | Status |',
          '| --- | --- |',
          '| Notes | Ready |',
          '',
          '```sh',
          'git fetch origin',
          '```',
          '',
          '[Details](https://forge.example/team/app/compare/v2.2.1...v2.2.2)',
        ].join('\n'),
      }),
    ]);
    expect(host.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('Release history');
    expect(host.querySelector('.markdown-preview-content h2')?.textContent).toBe('Improvements');
    expect(host.querySelector('li strong')?.textContent).toBe('Preview');
    expect(host.querySelector('td')?.textContent).toBe('Notes');
    expect(host.querySelector('pre code')?.textContent).toContain('git fetch origin');
    expect(host.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-07T09:00:00Z');
    await act(async () => host.querySelector<HTMLAnchorElement>('a')!.click());
    expect(mocks.openExternal).toHaveBeenCalledWith('https://forge.example/team/app/compare/v2.2.1...v2.2.2');
    await act(async () => host.querySelector<HTMLButtonElement>('.hosting-release__header button')!.click());
    expect(mocks.openExternal).toHaveBeenLastCalledWith(release().htmlUrl);
  });

  it('sanitizes remote HTML and does not load relative images from the application origin', async () => {
    await render([
      release({ body: '## Notes\n\n<script>alert("unsafe")</script><img src="./private.png" onerror="alert(1)" />\n\n[unsafe](javascript:alert(1))' }),
    ]);
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('[onerror]')).toBeNull();
    expect(host.querySelector('img')?.getAttribute('src')).toBeNull();
    expect(host.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it('explains absent notes and shows draft/prerelease states without invalid publication dates', async () => {
    await render([release({ draft: true, prerelease: true }), release({ id: 'other', tagName: 'v2.1.1', name: '', publishedAt: 'invalid' })]);
    expect(host.querySelectorAll('.diff-empty-state')).toHaveLength(2);
    expect(host.textContent).toContain('No release notes are available for this version.');
    expect(host.querySelector('.ui-status-badge--warning')?.textContent).toBe('Draft');
    expect(host.querySelector('.ui-status-badge--info')?.textContent).toBe('Prerelease');
    expect(host.querySelector('time')).toBeNull();
    expect(host.querySelectorAll('.hosting-release__header h3')[1].textContent).toBe('v2.1.1');
  });

  it('loads attachments only when expanded and resets them when the hosting account changes', async () => {
    mocks.request.mockResolvedValue({
      items: [{ id: 'asset', name: 'Open-Git-Control.zip', htmlUrl: 'https://forge.example/download.zip' }],
      nextCursor: null,
    });
    await render([release({ body: 'Private release notes' })], true);
    expect(mocks.request).not.toHaveBeenCalled();
    const details = host.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(mocks.request).toHaveBeenCalledWith('releaseAssets', { repository, releaseId: 'release-1' });
    expect(host.querySelectorAll('summary')).toHaveLength(1);
    expect(host.querySelector('.hosting-release-files h3')).toBeNull();
    const assetButton = host.querySelector<HTMLButtonElement>('[aria-label="Open-Git-Control.zip"]')!;
    await act(async () => assetButton.click());
    expect(mocks.openExternal).toHaveBeenCalledWith('https://forge.example/download.zip');
    await render([release({ body: 'Backup release notes' })], true, { ...repository, connectionId: 'github-backup' });
    expect(host.querySelector('details')?.open).toBe(false);
    expect(host.textContent).not.toContain('Open-Git-Control.zip');
    expect(host.textContent).not.toContain('Private release notes');
    expect(host.textContent).toContain('Backup release notes');
  });
});
