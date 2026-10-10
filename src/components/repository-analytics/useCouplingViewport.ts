import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CouplingScene } from './analyticsCouplingScene';

export type CouplingCamera = { x: number; y: number; scale: number };
export function fitCouplingCamera(scene: CouplingScene, width: number, height: number): CouplingCamera {
  const scale = Math.max(
    0.000001,
    Math.min((Math.max(1, width) - Math.min(40, width / 4)) / scene.width, (Math.max(1, height) - Math.min(40, height / 4)) / scene.height, 1.8),
  );
  return { scale, x: (width - scene.width * scale) / 2 - (scene.left ?? 0) * scale, y: (height - scene.height * scale) / 2 - (scene.top ?? 0) * scale };
}
export function zoomCouplingCamera(camera: CouplingCamera, factor: number, point: { x: number; y: number }, minScale: number): CouplingCamera {
  const scale = Math.max(minScale, Math.min(8, camera.scale * factor));
  return { scale, x: point.x - ((point.x - camera.x) * scale) / camera.scale, y: point.y - ((point.y - camera.y) * scale) / camera.scale };
}

export function useCouplingViewport(
  scene: CouplingScene,
  width: number,
  height: number,
  loading: boolean,
  element: React.RefObject<HTMLDivElement>,
  onInteract: () => void,
) {
  const [camera, setCamera] = useState<CouplingCamera>({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const automatic = useRef(true);
  const gesture = useRef<{ id: number; x: number; y: number; camera: CouplingCamera; moved: boolean }>();
  const ignoreClick = useRef(false);
  const dimensions = useRef({ width, height });
  const fit = useCallback(() => {
    onInteract();
    automatic.current = false;
    setCamera(fitCouplingCamera(scene, width, height));
  }, [scene, width, height, onInteract]);
  useLayoutEffect(() => {
    const previous = dimensions.current;
    dimensions.current = { width, height };
    if (automatic.current && scene.nodes.length) {
      setCamera(fitCouplingCamera(scene, width, height));
      const measured = element.current?.getBoundingClientRect();
      if (!loading && (!measured?.width || (Math.abs(measured.width - width) < 0.5 && Math.abs(measured.height - height) < 0.5))) automatic.current = false;
    } else if (width !== previous.width || height !== previous.height) {
      setCamera((value) => ({ ...value, x: value.x + (width - previous.width) / 2, y: value.y + (height - previous.height) / 2 }));
    }
  }, [scene, width, height, loading, element]);
  const zoom = useCallback(
    (factor: number, point = { x: width / 2, y: height / 2 }) => {
      onInteract();
      automatic.current = false;
      setCamera((value) => zoomCouplingCamera(value, factor, point, Math.min(0.05, fitCouplingCamera(scene, width, height).scale / 4)));
    },
    [scene, width, height, onInteract],
  );
  const pan = useCallback(
    (x: number, y: number) => {
      onInteract();
      automatic.current = false;
      setCamera((value) => ({ ...value, x: value.x + x, y: value.y + y }));
    },
    [onInteract],
  );
  const reveal = useCallback(
    (point: { x: number; y: number }) => {
      onInteract();
      automatic.current = false;
      setCamera((value) => {
        const x = point.x * value.scale + value.x,
          y = point.y * value.scale + value.y;
        return {
          ...value,
          x: value.x + (x < 45 || x > width - 45 ? width / 2 - x : 0),
          y: value.y + (y < 45 || y > height - 45 ? height / 2 - y : 0),
        };
      });
    },
    [width, height, onInteract],
  );
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const wheel = (event: WheelEvent) => {
      if (!scene.nodes.length) return;
      event.preventDefault();
      const bounds = target.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      zoom(Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.005), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    };
    target.addEventListener('wheel', wheel, { passive: false });
    return () => target.removeEventListener('wheel', wheel);
  }, [element, zoom, height, scene.nodes.length]);
  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    camera,
    dragging,
    fit,
    zoom,
    reveal,
    interaction: {
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        ignoreClick.current = false;
        if (event.button !== 0 || event.isPrimary === false || (event.target as Element).closest('button')) return;
        event.preventDefault();
        onInteract();
        automatic.current = false;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera, moved: false };
      },
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const x = event.clientX - start.x,
          y = event.clientY - start.y;
        if (!start.moved && Math.hypot(x, y) < 4) return;
        start.moved = true;
        ignoreClick.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
        setCamera({ ...start.camera, x: start.camera.x + x, y: start.camera.y + y });
      },
      onPointerUp: stopDrag,
      onPointerCancel: stopDrag,
      onLostPointerCapture: stopDrag,
      onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => {
        if (!ignoreClick.current) return;
        ignoreClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === '+' || event.key === '=') zoom(1.25);
        else if (event.key === '-') zoom(0.8);
        else if (event.key === 'Home' || event.key === '0') fit();
        else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          const step = event.shiftKey ? 120 : 50;
          pan(
            event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0,
            event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0,
          );
        } else return;
        event.preventDefault();
      },
    },
  };
}
