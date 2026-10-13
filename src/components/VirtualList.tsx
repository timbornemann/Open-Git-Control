import React, { useEffect, useMemo, useRef, useState } from 'react';

type VirtualListProps<T> = {
  items: T[];
  rowHeight: number;
  maxHeight?: number;
  overscan?: number;
  getKey: (item: T, index: number) => React.Key;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  fillAvailableHeight?: boolean;
  focusRequest?: { index: number; id: number };
};

export const calculateVirtualRange = (itemCount: number, scrollTop: number, viewportHeight: number, rowHeight: number, overscan: number) => {
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const startIndex = Math.min(Math.max(0, itemCount - visibleCount), Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  return {
    startIndex,
    endIndex: Math.min(itemCount, startIndex + visibleCount),
  };
};

export function VirtualList<T>({
  items,
  rowHeight,
  maxHeight = 360,
  overscan = 8,
  getKey,
  renderItem,
  className,
  fillAvailableHeight = false,
  focusRequest,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [availableHeight, setAvailableHeight] = useState(rowHeight);
  const listRef = useRef<HTMLDivElement>(null);
  const acceptedFocus = useRef<number | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const viewportHeight = fillAvailableHeight ? Math.max(1, availableHeight) : Math.min(maxHeight, Math.max(rowHeight, items.length * rowHeight));

  useEffect(() => {
    if (!fillAvailableHeight) return;

    const listElement = listRef.current;
    if (!listElement) return;

    const updateAvailableHeight = (nextHeight: number) => {
      if (nextHeight <= 0) return;
      setAvailableHeight((currentHeight) => {
        return currentHeight === nextHeight ? currentHeight : nextHeight;
      });
    };

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === listElement);
        if (entry) updateAvailableHeight(entry.contentRect.height);
      });
      observer.observe(listElement);
      return () => observer.disconnect();
    }

    // Legacy fallback: defer the layout read until after the commit rather than
    // forcing style/layout synchronously from a layout effect.
    if (typeof window.requestAnimationFrame === 'function') {
      const frameId = window.requestAnimationFrame(() => updateAvailableHeight(listElement.clientHeight));
      return () => window.cancelAnimationFrame(frameId);
    }
    const timeoutId = window.setTimeout(() => updateAvailableHeight(listElement.clientHeight), 0);
    return () => window.clearTimeout(timeoutId);
  }, [fillAvailableHeight]);

  const { startIndex, endIndex } = calculateVirtualRange(items.length, scrollTop, viewportHeight, rowHeight, overscan);
  const visibleItems = useMemo(() => items.slice(startIndex, endIndex), [endIndex, items, startIndex]);

  useEffect(() => {
    if (!focusRequest) {
      pendingFocus.current = null;
      return;
    }
    if (acceptedFocus.current === focusRequest.id || !listRef.current) return;
    acceptedFocus.current = focusRequest.id;
    if (focusRequest.index < 0 || focusRequest.index >= items.length) {
      pendingFocus.current = null;
      return;
    }
    pendingFocus.current = focusRequest.index;
    const rowTop = focusRequest.index * rowHeight;
    const nextTop = rowTop < scrollTop ? rowTop : rowTop + rowHeight > scrollTop + viewportHeight ? rowTop + rowHeight - viewportHeight : scrollTop;
    listRef.current.scrollTop = nextTop;
    setScrollTop(nextTop);
  }, [focusRequest, items.length, rowHeight, scrollTop, viewportHeight]);

  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const target = listRef.current?.querySelector<HTMLElement>(`[data-virtual-row="${index}"] button, [data-virtual-row="${index}"] [tabindex]`);
    if (target) {
      pendingFocus.current = null;
      target.focus({ preventScroll: true });
    }
  }, [startIndex, endIndex, focusRequest, items]);

  return (
    <div
      ref={listRef}
      className={className}
      style={{ height: fillAvailableHeight ? '100%' : viewportHeight, overflowY: 'auto', position: 'relative' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {visibleItems.map((item, visibleIndex) => {
          const index = startIndex + visibleIndex;
          return (
            <div
              key={getKey(item, index)}
              data-virtual-row={index}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: index * rowHeight,
                height: rowHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
