// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTutorialTarget } from './useTutorialTarget';
let root: Root, container: HTMLDivElement, workspace: HTMLDivElement, target: HTMLButtonElement;
const frames = new Map<number, FrameRequestCallback>();
let notifyResize: ResizeObserverCallback;
function Harness({ prepared = true }) {
  const result = useTutorialTarget('.example-target', prepared);
  return <output>{result.rect ? `${result.rect.left},${result.rect.top}` : 'waiting'}</output>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = frames.size + 1;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  container = document.createElement('div');
  workspace = document.createElement('div');
  workspace.className = 'tutorial-workspace';
  target = document.createElement('button');
  target.className = 'example-target';
  workspace.append(target);
  document.body.append(container, workspace);
  const rect = new DOMRect(100, 80, 90, 30);
  target.getClientRects = () => [rect] as unknown as DOMRectList;
  target.getBoundingClientRect = () => rect;
  workspace.getBoundingClientRect = () => new DOMRect(0, 44, 900, 500);
  target.scrollIntoView = vi.fn();
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  workspace.remove();
  frames.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('calculates the target even when a hidden renderer cannot deliver animation frames', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => root.render(<Harness />));
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(container.textContent).toBe('100,80');
  expect(frames.size).toBe(0);
  expect(target.getAttribute('aria-describedby')).toBe('tutorial-step-description');
});
it('replaces a suspended frame after visibility changes and cleans up on unmount', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  act(() => root.render(<Harness />));
  expect(container.textContent).toBe('waiting');
  visibility.mockReturnValue('hidden');
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(container.textContent).toBe('100,80');
  expect(frames.size).toBe(0);
  act(() => root.render(null));
  expect(target.hasAttribute('aria-describedby')).toBe(false);
});
it('reveals the current field again after a dialog restoration and its initial focus have settled', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => root.render(<Harness prepared={false} />));
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(target.scrollIntoView).toHaveBeenCalledOnce();
  act(() => root.render(<Harness />));
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
});

it('reveals a partially covered control when the coach subsequently reduces the practice viewport', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  let viewport = new DOMRect(0, 44, 900, 500);
  let position = new DOMRect(100, 480, 90, 30);
  workspace.getBoundingClientRect = () => viewport;
  target.getBoundingClientRect = () => position;
  target.scrollIntoView = vi.fn(() => {
    if (position.bottom > viewport.bottom) position = new DOMRect(100, viewport.bottom - position.height, 90, 30);
  });
  act(() => root.render(<Harness />));
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(target.scrollIntoView).toHaveBeenCalledOnce();
  viewport = new DOMRect(0, 44, 900, 430);
  await act(async () => {
    notifyResize([], {} as ResizeObserver);
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
  expect(container.textContent).toBe('100,444');
  await act(async () => {
    document.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
});

it('reveals a field clipped by a resized dialog even when it remains inside the workspace', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const scrollArea = document.createElement('div');
  scrollArea.className = 'dialog-content';
  workspace.append(scrollArea);
  scrollArea.append(target);
  let clip = new DOMRect(50, 100, 500, 200.4);
  let position = new DOMRect(100, 200, 90, 30);
  scrollArea.getBoundingClientRect = () => clip;
  target.getBoundingClientRect = () => position;
  target.scrollIntoView = vi.fn(() => {
    if (position.bottom > clip.bottom) position = new DOMRect(100, clip.bottom - position.height - 1, 90, 30);
  });
  act(() => root.render(<Harness />));
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(target.scrollIntoView).toHaveBeenCalledOnce();
  clip = new DOMRect(50, 100, 500, 129.6);
  await act(async () => {
    notifyResize([], {} as ResizeObserver);
    await new Promise((resolve) => {
      setTimeout(resolve, 15);
    });
  });
  expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
  expect(position.bottom).toBeLessThanOrEqual(clip.bottom);
  expect(container.textContent).toBe('100,198.6');
});
