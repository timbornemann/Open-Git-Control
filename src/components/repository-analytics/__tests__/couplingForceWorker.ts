import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { build } from 'vite';
import { afterEach } from 'vitest';
import type { CouplingForceRequest, CouplingForceResult } from '../analyticsCouplingForce';

let source: Promise<string> | undefined;
const active = new Set<Worker>();

async function workerSource(): Promise<string> {
  // Bundle the actual browser worker, without a dev server or filesystem output.
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: { entry: path.resolve(__dirname, '../analyticsCouplingWorker.ts'), formats: ['es'] },
    },
  });
  const bundles = Array.isArray(output) ? output : [output];
  if (bundles.length !== 1 || !('output' in bundles[0])) throw new Error('Expected a single coupling worker bundle.');
  const entry = bundles[0].output.find((item) => item.type === 'chunk' && item.isEntry);
  if (!entry || entry.type !== 'chunk') throw new Error('The coupling worker bundle has no entry.');
  // Node ports adapt only the browser messaging API. Layout and scheduling are
  // the production code, running in an independent isolate as in the app.
  return `import { parentPort as __couplingPort } from 'node:worker_threads';
    globalThis.self = { postMessage: (data) => __couplingPort.postMessage(data) };
    __couplingPort.on('message', (data) => self.onmessage({ data }));
    ${entry.code}`;
}

afterEach(async () => {
  await Promise.all([...active].map((worker) => worker.terminate()));
  active.clear();
});

export async function relaxCouplingInWorker(request: CouplingForceRequest): Promise<CouplingForceResult['scene']> {
  const code = await (source ??= workerSource());
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(code)}`), { execArgv: [] });
  active.add(worker);
  try {
    return await new Promise<CouplingForceResult['scene']>((resolve, reject) => {
      worker.on('message', (result: CouplingForceResult) => {
        if (result.done) resolve(result.scene);
      });
      worker.once('error', reject);
      worker.once('exit', (code) => reject(new Error(`Coupling worker exited before completing the layout (${code}).`)));
      worker.postMessage(request);
    });
  } finally {
    active.delete(worker);
    await worker.terminate();
  }
}
