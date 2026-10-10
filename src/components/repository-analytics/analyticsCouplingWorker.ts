import { COUPLING_FORCE_TICKS, createCouplingForce, readCouplingForce, type CouplingForceRequest, type CouplingForceResult } from './analyticsCouplingForce';

self.onmessage = ({ data }: MessageEvent<CouplingForceRequest>) => {
  const simulation = createCouplingForce(data.pairs, data.seed, data.anchors);
  let ticks = 0,
    lastPublished = performance.now();
  const step = () => {
    const start = performance.now();
    do {
      simulation.tick();
      ticks++;
    } while (ticks < COUPLING_FORCE_TICKS && performance.now() - start < 12);
    const done = ticks >= COUPLING_FORCE_TICKS;
    if (done || performance.now() - lastPublished >= 100) {
      self.postMessage({ scene: readCouplingForce(simulation.nodes()), done } satisfies CouplingForceResult);
      lastPublished = performance.now();
    }
    if (!done) setTimeout(step, 0);
  };
  step();
};
