import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

type VirtualListProps<T> = {
  items: T[];
  rowHeight: number;
  maxHeight?: number;
  overscan?: number;
  getKey: (item: T, index: number) => React.Key;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  fillAvailableHeight?: boolean;
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
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [availableHeight, setAvailableHeight] = useState(rowHeight);
  const listRef = useRef<HTMLDivElement>(null);
  const viewportHeight = fillAvailableHeight ? Math.max(1, availableHeight) : Math.min(maxHeight, Math.max(rowHeight, items.length * rowHeight));

  useLayoutEffect(() => {
    if (!fillAvailableHeight) return;

    const listElement = listRef.current;
    if (!listElement) return;

    const updateAvailableHeight = () => {
      setAvailableHeight((currentHeight) => {
        const nextHeight = listElement.clientHeight;
        return currentHeight === nextHeight ? currentHeight : nextHeight;
      });
    };

    updateAvailableHeight();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateAvailableHeight);
    observer.observe(listElement);
    return () => observer.disconnect();
  }, [fillAvailableHeight]);

  const { startIndex, endIndex } = calculateVirtualRange(items.length, scrollTop, viewportHeight, rowHeight, overscan);
  const visibleItems = useMemo(() => items.slice(startIndex, endIndex), [endIndex, items, startIndex]);

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
