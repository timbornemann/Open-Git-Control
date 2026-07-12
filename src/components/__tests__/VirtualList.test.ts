// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateVirtualRange, VirtualList } from '@/components/VirtualList';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('calculateVirtualRange', () => {
  it.each([500, 5_000, 100_000])('keeps the rendered window bounded for %i files', (itemCount) => {
    const range = calculateVirtualRange(itemCount, itemCount * 10, 560, 28, 8);
    expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(36);
    expect(range.startIndex).toBeGreaterThanOrEqual(0);
    expect(range.endIndex).toBeLessThanOrEqual(itemCount);
  });

  it('clamps the final window at the end of the list', () => {
    expect(calculateVirtualRange(500, 100_000, 560, 28, 8)).toEqual({
      startIndex: 464,
      endIndex: 500,
    });
  });

  it('uses ResizeObserver metrics without a synchronous clientHeight read after mount', () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    let observedElement: Element | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe(target: Element) {
          observedElement = target;
        }
        disconnect() {}
      },
    );
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(560);
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root')!);
    const items = Array.from({ length: 100 }, (_, index) => index);

    act(() => {
      root.render(
        createElement(VirtualList<number>, {
          items,
          rowHeight: 28,
          fillAvailableHeight: true,
          getKey: (item) => item,
          renderItem: (item) => String(item),
        }),
      );
    });

    expect(clientHeight).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[style*="position: absolute"]').length).toBe(17);
    act(() => {
      resizeCallback?.([{ target: observedElement!, contentRect: { height: 280 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    expect(document.querySelectorAll('[style*="position: absolute"]').length).toBe(26);
    act(() => root.unmount());
  });
});
