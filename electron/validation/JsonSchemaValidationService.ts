import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { IpcResult } from '../../src/types/ipc';
import { JSON_SCHEMA_MAX_SCHEMA_CHARS, JSON_SCHEMA_MAX_SOURCE_CHARS, type JsonSchemaValidationRequest } from '../../src/shared/ipc/jsonSchemaValidation';

type ValidationWorker = Pick<Worker, 'once' | 'removeAllListeners' | 'terminate'>;
type Options = { timeoutMs?: number; createWorker?: (request: JsonSchemaValidationRequest) => ValidationWorker };
const failure = (error: string): IpcResult<string[]> => ({ success: false, error });

/** Untrusted schema compilation and regexes cannot block the privileged Electron event loop. */
export class JsonSchemaValidationService {
  private active = 0;
  constructor(private readonly options: Options = {}) {}

  async validate(input: unknown, signal?: AbortSignal): Promise<IpcResult<string[]>> {
    if (!input || typeof input !== 'object') return failure('Invalid JSON Schema validation request.');
    const { source, schemaSource } = input as Partial<JsonSchemaValidationRequest>;
    if (typeof source !== 'string' || typeof schemaSource !== 'string') return failure('Invalid JSON Schema validation request.');
    if (source.length > JSON_SCHEMA_MAX_SOURCE_CHARS || schemaSource.length > JSON_SCHEMA_MAX_SCHEMA_CHARS)
      return failure('JSON Schema validation input is too large.');
    if (signal?.aborted) return failure('JSON Schema validation was cancelled.');
    if (this.active >= 2) return failure('JSON Schema validation is busy. Try again shortly.');
    this.active++;
    try {
      return await this.run({ source, schemaSource }, signal);
    } finally {
      this.active--;
    }
  }

  private run(request: JsonSchemaValidationRequest, signal?: AbortSignal): Promise<IpcResult<string[]>> {
    return new Promise((resolve) => {
      let task: ValidationWorker;
      try {
        task = this.options.createWorker
          ? this.options.createWorker(request)
          : new Worker(path.join(__dirname, 'jsonSchemaValidation.worker.js'), {
              workerData: request,
              resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
            });
      } catch {
        resolve(failure('Could not start JSON Schema validation.'));
        return;
      }
      let settled = false;
      const finish = (result: IpcResult<string[]>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        void task
          .terminate()
          .catch(() => undefined)
          .then(() => {
            task.removeAllListeners();
            resolve(result);
          });
      };
      const cancel = () => finish(failure('JSON Schema validation was cancelled.'));
      const timer = setTimeout(() => finish(failure('JSON Schema validation timed out.')), this.options.timeoutMs ?? 10_000);
      task.once('message', (result: IpcResult<string[]>) => finish(result));
      task.once('error', () => finish(failure('JSON Schema validation worker failed.')));
      task.once('exit', () => finish(failure('JSON Schema validation worker stopped unexpectedly.')));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }
}
