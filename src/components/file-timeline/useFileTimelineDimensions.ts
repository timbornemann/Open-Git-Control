import { useEffect, useRef, useState } from 'react';
import type { FileTimelineDimensions } from './types';

export const useFileTimelineDimensions = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<FileTimelineDimensions>({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const nextWidth = Math.round(width);
        const nextHeight = Math.round(height);
        setDimensions((current) => (current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }));
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return {
    containerRef,
    dimensions,
  };
};
