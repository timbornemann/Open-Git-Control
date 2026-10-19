// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitIdentityClient } from '@/services/gitIdentityClient';
import type { GitIdentityStatus } from '@/shared/ipc/gitIdentity';
import { ensureCommitIdentity, finishGitIdentitySetup, useGitIdentityStore } from '@/app/state/gitIdentityStore';
import { GitIdentityDialog } from './GitIdentityDialog';
import { GitIdentitySettings } from './GitIdentitySettings';
import { searchSettingsGroups } from '@/components/layout/settings/settingsNavigation';
import { rememberIdentitySettingsScope } from './gitIdentityScopePreference';

const mocks = vi.hoisted(() => ({ activeRepo: '/repo' as string | null, toast: vi.fn(), saved: null as GitIdentityStatus | null }));
vi.mock('@/contexts/AppStateContext', () => ({ useOptionalActiveRepository: () => mocks.activeRepo }));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => mocks.toast }));
const missing: GitIdentityStatus = {
  repoPath: '/repo',
  scope: 'repository',
  name: 'Existing Name',
  email: '',
  ready: false,
  missing: ['email'],
  revision: 'a'.repeat(64),
};
let host: HTMLDivElement, root: Root;
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)!;
const input = (type: 'name' | 'email') => host.querySelector<HTMLInputElement>(`input[autocomplete="${type}"]`)!;
function change(type: 'name' | 'email', value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input(type), value);
    input(type).dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const render = async (dialog = false) => {
  await act(async () => {
    root.render(
      createElement(I18nProvider, {
        language: 'en',
        children: dialog ? createElement(GitIdentityDialog, { activeRepo: mocks.activeRepo }) : createElement(GitIdentitySettings),
      }),
    );
  });
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.activeRepo = '/repo';
  mocks.saved = null;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  mocks.toast.mockReset();
  useGitIdentityStore.setState({ activeRepo: undefined, generation: 0, request: null });
  vi.spyOn(gitIdentityClient, 'isAvailable').mockReturnValue(true);
  vi.spyOn(gitIdentityClient, 'read').mockImplementation(async ({ repoPath, scope }) => ({
    success: true,
    data:
      scope === 'global'
        ? {
            ...missing,
            name: 'Global Name',
            email: 'global@example.invalid',
            ready: true,
            ...(mocks.saved?.scope === 'global' ? mocks.saved : {}),
            repoPath,
            scope,
          }
        : { ...missing, ...mocks.saved, repoPath, scope, ready: Boolean(mocks.saved) },
  }));
  vi.spyOn(gitIdentityClient, 'save').mockImplementation(async (request) => {
    mocks.saved = { ...missing, ...request, ready: true };
    return { success: true, data: mocks.saved };
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  const request = useGitIdentityStore.getState().request;
  if (request) act(() => finishGitIdentitySetup(request.id, false));
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared Git identity form', () => {
  it('offers discoverable settings, shows effective values and saves only by an explicit action', async () => {
    expect(searchSettingsGroups('user.email', (_de, en) => en).map((group) => group.id)).toContain('git-identity');
    await render();
    expect(input('name').value).toBe('Existing Name');
    expect(host.textContent).toContain('Hosting sign-in is independent');
    expect(gitIdentityClient.save).not.toHaveBeenCalled();
    expect(button('Save').disabled).toBe(true);
    change('email', 'local@example.invalid');
    expect(button('Save').disabled).toBe(false);
    await act(async () => button('Save').click());
    expect(gitIdentityClient.save).toHaveBeenCalledExactlyOnceWith({
      repoPath: '/repo',
      scope: 'repository',
      name: 'Existing Name',
      email: 'local@example.invalid',
      expectedRevision: missing.revision,
    });
    expect(mocks.toast).toHaveBeenCalledWith('Git commit identity saved.', false);
  });
  it('loads and edits global configuration without any active repository', async () => {
    mocks.activeRepo = null;
    await render();
    const scope = host.querySelector('select')!;
    expect(scope.options).toHaveLength(1);
    expect(scope.value).toBe('global');
    expect(input('name').value).toBe('Global Name');
    change('name', 'Updated Global');
    await act(async () => button('Save').click());
    expect(gitIdentityClient.save).toHaveBeenCalledWith(expect.objectContaining({ repoPath: null, scope: 'global', name: 'Updated Global' }));
  });
  it('keeps a failed-save draft and reports the error through central notifications', async () => {
    vi.mocked(gitIdentityClient.save).mockResolvedValue({ success: false, error: 'Git config is locked' });
    await render();
    change('email', 'draft@example.invalid');
    await act(async () => button('Save').click());
    expect(input('email').value).toBe('draft@example.invalid');
    expect(mocks.toast).toHaveBeenCalledWith('Git config is locked', true);
    expect(host.textContent).not.toContain('Git config is locked');
    expect(button('Save').disabled).toBe(false);
  });
  it('switches scope without writing and does not mix local and global configuration', async () => {
    await render();
    await act(async () => {
      const scope = host.querySelector('select')!;
      scope.value = 'global';
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(input('name').value).toBe('Global Name');
    expect(input('email').value).toBe('global@example.invalid');
    expect(gitIdentityClient.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Repository settings take precedence');
  });
  it('retains the pending commit until Git confirms the saved effective identity', async () => {
    await render(true);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = ensureCommitIdentity('/repo');
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input('name').value).toBe('Existing Name');
    change('email', 'author@example.invalid');
    await act(async () => button('Save and continue').click());
    expect(await pending).toBe(true);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(gitIdentityClient.read).toHaveBeenLastCalledWith({ repoPath: '/repo', scope: 'repository' });
  });
  it('cancels setup without writing and leaves the commit unstarted', async () => {
    await render(true);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = ensureCommitIdentity('/repo');
    });
    act(() => button('Cancel').click());
    expect(await pending).toBe(false);
    expect(gitIdentityClient.save).not.toHaveBeenCalled();
  });
  it('keeps setup open when another Git identity override is still missing', async () => {
    vi.mocked(gitIdentityClient.save).mockImplementation(async () => ({ success: true, data: missing }));
    await render(true);
    await act(async () => {
      void ensureCommitIdentity('/repo');
    });
    change('email', 'author@example.invalid');
    await act(async () => button('Save and continue').click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input('email').value).toBe('author@example.invalid');
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('overrides take precedence'), true);
  });
  it('ignores a save completing after the repository is changed', async () => {
    let resolve!: (result: Awaited<ReturnType<typeof gitIdentityClient.save>>) => void;
    vi.mocked(gitIdentityClient.save).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await render(true);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = ensureCommitIdentity('/repo');
    });
    change('email', 'author@example.invalid');
    act(() => button('Save and continue').click());
    mocks.activeRepo = '/other';
    await render(true);
    await act(async () => {
      resolve({ success: true, data: { ...missing, ready: true } });
    });
    expect(await pending).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('restores the chosen global scope and saved email after reopening settings with an active repository', async () => {
    await render();
    await act(async () => {
      const scope = host.querySelector('select')!;
      scope.value = 'global';
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    change('email', 'updated-global@example.invalid');
    await act(async () => button('Save').click());
    act(() => root.render(null));
    mocks.activeRepo = '/another-repository';
    await render();
    expect(host.querySelector('select')!.value).toBe('global');
    expect(input('email').value).toBe('updated-global@example.invalid');
    expect(gitIdentityClient.save).toHaveBeenCalledOnce();
  });

  it('does not report success when the native readback contains the old identity', async () => {
    vi.mocked(gitIdentityClient.save).mockResolvedValue({ success: true, data: { ...missing, email: 'old@example.invalid', ready: true } });
    await render();
    change('email', 'desired@example.invalid');
    await act(async () => button('Save').click());
    expect(input('email').value).toBe('desired@example.invalid');
    expect(mocks.toast).not.toHaveBeenCalledWith('Git commit identity saved.', false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Git did not apply'), true);
  });

  it('shows the verified normalized values after saving and after a fresh read', async () => {
    await render();
    change('name', '  Updated Name  ');
    change('email', '  updated@example.invalid  ');
    await act(async () => button('Save').click());
    expect(input('name').value).toBe('Updated Name');
    expect(input('email').value).toBe('updated@example.invalid');
    await act(async () => button('Reload').click());
    expect(input('email').value).toBe('updated@example.invalid');
  });

  it('keeps commit setup scoped to its repository even when settings last edited global defaults', async () => {
    rememberIdentitySettingsScope('global');
    await render(true);
    await act(async () => {
      void ensureCommitIdentity('/repo');
    });
    expect(host.querySelector('select')!.value).toBe('repository');
    expect(gitIdentityClient.save).not.toHaveBeenCalled();
  });

  it('can still save when the optional settings scope preference cannot be stored', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable');
      },
      setItem: () => {
        throw new Error('Storage unavailable');
      },
    });
    await render();
    change('email', 'new@example.invalid');
    await act(async () => button('Save').click());
    expect(mocks.toast).toHaveBeenCalledWith('Git commit identity saved.', false);
  });

  it('falls back to a valid scope if the saved settings preference is damaged', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'invalid-scope', setItem: vi.fn() });
    await render();
    expect(host.querySelector('select')!.value).toBe('repository');
    expect(gitIdentityClient.read).toHaveBeenCalledWith({ repoPath: '/repo', scope: 'repository' });
  });

  it('does not continue a commit when saved global defaults are still overridden by another valid repository identity', async () => {
    await render(true);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = ensureCommitIdentity('/repo');
    });
    await act(async () => {
      const scope = host.querySelector('select')!;
      scope.value = 'global';
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    change('email', 'global-new@example.invalid');
    vi.mocked(gitIdentityClient.read).mockResolvedValue({ success: true, data: { ...missing, email: 'local-old@example.invalid', ready: true } });
    await act(async () => button('Save and continue').click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('overrides take precedence'), true);
    expect(mocks.toast).not.toHaveBeenCalledWith('Git commit identity saved.', false);
    act(() => button('Cancel').click());
    expect(await pending).toBe(false);
  });
});
