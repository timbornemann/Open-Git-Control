import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalyticsCoupling } from '@/shared/ipc/repositoryAnalytics';
import { buildCouplingScene, couplingPairKey, type CouplingPair, type CouplingScene } from './analyticsCouplingGeometry';
import { relaxCouplingScene, type CouplingForceRequest, type CouplingForceResult } from './analyticsCouplingForce';

export { buildCouplingScene } from './analyticsCouplingGeometry';
export type { CouplingScene } from './analyticsCouplingGeometry';

export function useCouplingScene(rows: AnalyticsCoupling[], loading = false) {
  const previous = useRef<CouplingScene>();
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const locked = useRef(false);
  const completed = useRef(false);
  const worker = useRef<Worker>();
  const structure = JSON.stringify([...new Set(rows.map(couplingPairKey))].sort());
  const graph = useMemo(() => {
    const pairs = (JSON.parse(structure) as string[]).map((key) => {
      const [first, second] = JSON.parse(key) as [string, string];
      return { first, second };
    }) satisfies CouplingPair[];
    return { pairs, seed: buildCouplingScene(pairs, previous.current), anchors: completed.current || locked.current ? (previous.current?.nodes ?? []) : [] };
  }, [structure]);
  const [result, setResult] = useState({ structure, scene: graph.seed, settling: !!rows.length });
  const scene = result.structure === structure ? result.scene : graph.seed;
  const lock = useCallback(() => {
    locked.current = true;
    completed.current = true;
    worker.current?.terminate();
    worker.current = undefined;
    setResult((value) => (value.settling ? { ...value, settling: false } : value));
  }, []);
  useEffect(() => {
    previous.current = scene;
  }, [scene]);
  useEffect(() => {
    if (!loading && !result.settling && result.structure === structure) completed.current = true;
  }, [loading, result.settling, result.structure, structure]);
  useEffect(() => {
    let active = true;
    const finish = (scene: CouplingScene) => {
      if (!active) return;
      completed.current ||= !loadingRef.current;
      previous.current = scene;
      setResult({ structure, scene, settling: false });
    };
    const fallback = () => finish(relaxCouplingScene(graph.pairs, graph.seed, graph.anchors));
    setResult({ structure, scene: graph.seed, settling: !!graph.pairs.length });
    if (!graph.pairs.length) finish(graph.seed);
    else if (typeof Worker === 'undefined') fallback();
    else {
      try {
        const task = new Worker(new URL('./analyticsCouplingWorker.ts', import.meta.url), { type: 'module' });
        worker.current = task;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        task.onmessage = ({ data }: MessageEvent<CouplingForceResult>) => {
          if (!active || worker.current !== task) return;
          if (data.done) {
            finish(data.scene);
            task.terminate();
            worker.current = undefined;
          } else if (!reduceMotion) {
            previous.current = data.scene;
            setResult({ structure, scene: data.scene, settling: true });
          }
        };
        task.onerror = () => {
          if (!active || worker.current !== task) return;
          task.terminate();
          worker.current = undefined;
          fallback();
        };
        task.postMessage(graph satisfies CouplingForceRequest);
      } catch {
        fallback();
      }
    }
    return () => {
      active = false;
      worker.current?.terminate();
      worker.current = undefined;
    };
  }, [graph, structure]);
  return { scene, settling: result.structure !== structure || result.settling, lock };
}
