import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { buildCouplingScene, couplingBounds, couplingPairKey, type CouplingNode, type CouplingPair, type CouplingScene } from './analyticsCouplingGeometry';

export const COUPLING_FORCE_TICKS = 220;
type Particle = CouplingNode & SimulationNodeDatum;
type Link = { source: string | Particle; target: string | Particle };

/** Quadtree forces, without an all-pairs loop or file-count cap.
 * Counts are absent: a metrics update must not rearrange the graph. */
export function createCouplingForce(pairs: CouplingPair[], seed: CouplingScene, anchors: CouplingNode[] = []) {
  const nodes: Particle[] = seed.nodes.map((node) => ({ ...node }));
  const fixed = new Map(anchors.map((node) => [node.path, node]));
  for (const node of nodes) {
    const point = fixed.get(node.path);
    if (point) {
      node.fx = point.x;
      node.fy = point.y;
    }
  }
  const centerX = nodes.reduce((sum, node) => sum + node.x, 0) / Math.max(1, nodes.length);
  const centerY = nodes.reduce((sum, node) => sum + node.y, 0) / Math.max(1, nodes.length);
  const links: Link[] = [...new Set(pairs.map(couplingPairKey))].sort().map((key) => {
    const [source, target] = JSON.parse(key) as [string, string];
    return { source, target };
  });
  return forceSimulation<Particle>(nodes)
    .stop()
    .alphaDecay(1 - Math.pow(0.001, 1 / COUPLING_FORCE_TICKS))
    .velocityDecay(0.4)
    .force(
      'links',
      forceLink<Particle, Link>(links)
        .id((node) => node.path)
        .distance(110)
        .iterations(2),
    )
    .force(
      'charge',
      forceManyBody<Particle>()
        .strength((node) => -650 * (1 + Math.min(2, Math.sqrt(node.connections) * 0.08)))
        .distanceMin(20)
        .distanceMax(1500)
        .theta(0.9),
    )
    .force('collision', forceCollide<Particle>(32).strength(1).iterations(2))
    .force('x', forceX<Particle>(centerX).strength(0.025))
    .force('y', forceY<Particle>(centerY).strength(0.025));
}

export function readCouplingForce(nodes: CouplingNode[]): CouplingScene {
  return couplingBounds(nodes.map(({ path, x, y, connections }) => ({ path, x, y, connections })));
}

export function relaxCouplingScene(pairs: CouplingPair[], seed = buildCouplingScene(pairs), anchors: CouplingNode[] = []): CouplingScene {
  const simulation = createCouplingForce(pairs, seed, anchors);
  simulation.tick(COUPLING_FORCE_TICKS);
  return readCouplingForce(simulation.nodes());
}

export type CouplingForceRequest = { pairs: CouplingPair[]; seed: CouplingScene; anchors: CouplingNode[] };
export type CouplingForceResult = { scene: CouplingScene; done: boolean };
