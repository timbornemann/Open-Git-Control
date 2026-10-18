// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { Input } from '@/components/Input';
import { gitClient } from '@/services/gitClient';
import type { GitLfsFileState, TrackWithGitLfsRequest } from '@/shared/ipc/gitLfs';
import { useStagingLfs } from './useStagingLfs';
import type { InputDialogState } from './types';

const entry = { path: 'assets/design.psd', x: 'A', y: 'M' };
const status = { staged: [entry], unstaged: [entry], untracked: [] };
const fileState: GitLfsFileState = {
  path: entry.path,
  source: 'staged',
  version: 'checked-index',
  bytes: 12345,
  eligible: true,
  configured: false,
  pointer: false,
  needsRestage: false,
  extension: '.psd',
};
describe('LFS configuration choices in the standard dialog', () => {
  let root: Root;
  let host: HTMLDivElement;
  let current: ReturnType<typeof useStagingLfs>;
  const track = vi.fn(async (_request: TrackWithGitLfsRequest) => true);
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(gitClient, 'getGitLfsStatus').mockResolvedValue({
      success: true,
      data: { available: true, files: [fileState, { ...fileState, source: 'unstaged', version: 'checked-working' }] },
    });
    track.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  const render = async () => {
    function Harness() {
      const [dialog, setDialog] = useState<InputDialogState | null>(null);
      current = useStagingLfs('C:/repo', status, track, setDialog);
      return dialog ? (
        <Input
          {...dialog}
          open
          onCancel={() => setDialog(null)}
          onSubmit={(values) => {
            setDialog(null);
            void dialog.onSubmit(values);
          }}
        />
      ) : null;
    }
    await act(async () =>
      root.render(
        <I18nProvider language="en">
          <Harness />
        </I18nProvider>,
      ),
    );
  };
  const select = () => document.querySelector<HTMLSelectElement>('.dialog-field select')!;
  const click = async (label: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  it('defaults individual files to configuration only and preserves the checked staged source', async () => {
    await render();
    act(() => current.configure(entry, 'staged', 'file'));
    expect([...select().options].map((option) => option.value)).toEqual(['none', 'selected']);
    expect(select().value).toBe('none');
    expect(document.body.textContent).toContain('Configuration only leaves staging unchanged');
    await click('Apply');
    expect(track).toHaveBeenCalledExactlyOnceWith({
      repoPath: 'C:/repo',
      path: entry.path,
      source: 'staged',
      scope: 'file',
      expectedVersion: 'checked-index',
      staging: 'none',
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each(['none', 'selected', 'matching'] as const)('offers every extension choice and forwards %s using the selected working version', async (staging) => {
    await render();
    act(() => current.configure(entry, 'unstaged', 'extension'));
    expect([...select().options].map((option) => option.value)).toEqual(['none', 'selected', 'matching']);
    expect(select().value).toBe('none');
    expect(document.body.textContent).toContain('*.psd');
    expect(document.body.textContent).toContain('Other files retain existing partial staging');
    act(() => {
      select().value = staging;
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Apply');
    expect(track).toHaveBeenCalledExactlyOnceWith({
      repoPath: 'C:/repo',
      path: entry.path,
      source: 'unstaged',
      scope: 'extension',
      expectedVersion: 'checked-working',
      staging,
    });
  });

  it('cancels without configuring or staging anything and resets the choice when reopened', async () => {
    await render();
    act(() => current.configure(entry, 'staged', 'extension'));
    act(() => {
      select().value = 'matching';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Cancel');
    expect(track).not.toHaveBeenCalled();
    act(() => current.configure(entry, 'staged', 'file'));
    expect(select().value).toBe('none');
  });
});
