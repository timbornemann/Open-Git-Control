import { parentPort, workerData } from 'node:worker_threads';
import { validateJsonSchema } from './validateJsonSchema';

void validateJsonSchema(workerData).then(
  (data) => parentPort?.postMessage({ success: true, data }),
  (error: unknown) => parentPort?.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) }),
);
