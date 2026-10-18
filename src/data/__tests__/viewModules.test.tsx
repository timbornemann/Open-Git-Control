// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadable } from '../preloadableView';
import { getViewModule, preloadViewModule, viewModules } from '../viewModules';

describe('shared view module imports', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('shares one import across repeated intent, navigation and Strict Mode mounts', async () => {
    const Component = ({ text }: { text: string }) => <p>{text}</p>;
    let finish!: (module: { default: typeof Component }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ default: typeof Component }>((resolve) => {
          finish = resolve;
        }),
    );
    const module = preloadable(loader);
    const first = module.preload();
    expect(module.preload()).toBe(first);
    await act(async () =>
      root.render(
        <StrictMode>
          <module.View text="Active view" />
        </StrictMode>,
      ),
    );
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(module.isReady()).toBe(false);
    await act(async () => {
      finish({ default: Component });
      await first;
    });
    expect(host.textContent).toBe('Active view');
    expect(module.isReady()).toBe(true);
    expect(module.preload()).toBe(first);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('shows a preloaded view immediately and retains it across navigation', async () => {
    const loader = vi.fn(async () => ({ default: ({ text }: { text: string }) => <p>{text}</p> }));
    const module = preloadable(loader);
    await module.preload();
    act(() => root.render(<module.View text="First visit" />));
    expect(host.textContent).toBe('First visit');
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    act(() => root.render(null));
    act(() => root.render(<module.View text="Second visit" />));
    expect(host.textContent).toBe('Second visit');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('keeps an import reusable after its original view unmounts before completion', async () => {
    const Component = () => <p>Returned view</p>;
    let finish!: (module: { default: typeof Component }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ default: typeof Component }>((resolve) => {
          finish = resolve;
        }),
    );
    const module = preloadable(loader);
    await act(async () => root.render(<module.View />));
    act(() => root.render(null));
    await act(async () => {
      finish({ default: Component });
      await module.preload();
    });
    act(() => root.render(<module.View />));
    expect(host.textContent).toBe('Returned view');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('allows navigation to retry an earlier failed speculative import', async () => {
    const loader = vi
      .fn<() => Promise<{ default: () => React.ReactElement }>>()
      .mockRejectedValueOnce(new Error('Temporary import failure'))
      .mockResolvedValueOnce({ default: () => <p>Recovered view</p> });
    const module = preloadable(loader);
    await expect(module.preload()).rejects.toThrow('Temporary import failure');
    expect(module.isReady()).toBe(false);
    await act(async () => root.render(<module.View />));
    expect(host.textContent).toBe('Recovered view');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('maps legacy hosting navigation to the same shared module', () => {
    expect(getViewModule('github')).toBe(viewModules.hosting);
    expect(getViewModule('hosting')).toBe(viewModules.hosting);
  });

  it.each(['localRepos', 'constructor', 'toString', '__proto__'])('ignores non-module navigation %s', async (name) => {
    expect(getViewModule(name)).toBeUndefined();
    await expect(preloadViewModule(name)).resolves.toBeUndefined();
  });
});
