// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { ActionToastViewport } from '../ActionToastViewport';

let root: Root;
let container: HTMLDivElement;
const copy = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  copy.mockClear();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
describe('Git errors in the central notification viewport', () => {
  it.each([
    [16.107931316434996, 16],
    [101, 100],
    [-10, 0],
    [NaN, null],
  ])('shows concise bounded notification progress for %s', async (value, expected) => {
    await act(async () =>
      root.render(
        <I18nProvider language="en">
          <ActionToastViewport toasts={[{ id: 1, msg: 'Analyzing', isError: false, kind: 'progress', progress: { value, label: 'Files checked' } }]} />
        </I18nProvider>,
      ),
    );
    const track = container.querySelector('[role="progressbar"]')!;
    expect(track.getAttribute('aria-valuenow')).toBe(expected === null ? null : String(expected));
    expect(container.querySelector('.toast-progress-value')?.textContent ?? null).toBe(expected === null ? null : `${expected}%`);
  });
  it('shows a short explanation, collapsed full output, and copies the redacted diagnostic', async () => {
    const signIn = vi.fn();
    const raw = 'Command failed: git push\nGit Output: fatal: Authentication failed for https://user:password@example.test/repo.git';
    await act(async () =>
      root.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(ActionToastViewport, { toasts: [{ id: 1, msg: raw, isError: true, actions: [{ label: 'Sign in', onClick: signIn }] }] }),
        }),
      ),
    );
    expect(container.querySelector('[role="alert"] span')?.textContent).toContain('could not access');
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Technical details');
    expect(details.querySelector('pre')?.textContent).toContain('Git Output: fatal: Authentication failed');
    expect(container.textContent).not.toContain('user:password');
    const button = (text: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === text)!;
    await act(async () => button('Copy').click());
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('Command failed: git push'));
    expect(copy.mock.calls[0][0]).not.toContain('user:password');
    await act(async () => button('Sign in').click());
    expect(signIn).toHaveBeenCalledOnce();
    details.open = true;
    expect(details.open).toBe(true);
  });
});
