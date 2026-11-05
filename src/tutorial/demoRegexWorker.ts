import type { IpcResult } from '@/types/ipc';
import type { DemoRegexRequest } from './demoRegexEngine';
export const DEMO_REGEX_TIMEOUT = 1_000;
type Job = { token: symbol; cancel: () => void };
const active = new WeakMap<object, Job>();
const fail = (error: string): IpcResult<number[]> => ({ success: false, error });
const unavailable = 'Die Übungssuche ist momentan nicht verfügbar. Bitte erneut versuchen. / Practice search is unavailable. Please try again.';

/** One bounded read per practice model; every outcome terminates its worker. */
export function runDemoRegex(owner: object, request: DemoRegexRequest): Promise<IpcResult<number[]>> {
  active.get(owner)?.cancel();
  if (typeof Worker !== 'function') return Promise.resolve(fail(unavailable));
  let task: Worker;
  try {
    task = new Worker(new URL('./demoRegex.worker.ts', import.meta.url), { type: 'module', name: 'ogc-practice-regex' });
  } catch {
    return Promise.resolve(fail(unavailable));
  }
  const token = Symbol();
  return new Promise((resolve) => {
    let settled = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: IpcResult<number[]>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      task.onmessage = null;
      task.onerror = null;
      task.onmessageerror = null;
      task.terminate();
      if (active.get(owner)?.token === token) active.delete(owner);
      resolve(result);
    };
    active.set(owner, { token, cancel: () => finish(fail('Die Suche wurde durch eine neue Anfrage ersetzt. / The search was replaced by a new request.')) });
    task.onmessage = ({ data }: MessageEvent<IpcResult<number[]>>) => {
      if (data?.success === false && typeof data.error === 'string') finish(data);
      else if (
        data?.success === true &&
        Array.isArray(data.data) &&
        data.data.every((index, at) => Number.isSafeInteger(index) && index >= 0 && index < request.records.length && (at === 0 || data.data[at - 1] < index))
      )
        finish(data);
      else finish(fail(unavailable));
    };
    task.onerror = (event) => {
      event.preventDefault();
      finish(fail(unavailable));
    };
    task.onmessageerror = () => finish(fail(unavailable));
    timer = setTimeout(
      () => finish(fail('Das Muster benötigt zu lange. Bitte vereinfache es. / This pattern takes too long. Please simplify it.')),
      DEMO_REGEX_TIMEOUT,
    );
    try {
      task.postMessage(request);
    } catch {
      finish(fail(unavailable));
    }
  });
}
