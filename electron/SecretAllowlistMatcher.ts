import { Worker } from 'node:worker_threads';

export type SecretAllowlistRule = { kind: 'path' | 'text'; value: string } | { kind: 'regex'; pattern: RegExp; timedOut: boolean };
type Candidate = { filePath: string; line: string; ruleId: string };
// Data is passed through structured clone. No repository input becomes executable source.
const SOURCE = String.raw`
const { parentPort, workerData: rules } = require('node:worker_threads');
const vm = require('node:vm');
const context = vm.createContext({ pattern: null, input: '' });
const test = new vm.Script('pattern.test(input)');
function regex(rule, input) {
  if (rule.timedOut) return false;
  context.pattern = rule.pattern;
  context.input = input;
  try { return test.runInContext(context, { timeout: 100 }) === true; }
  catch { rule.timedOut = true; return false; }
  finally { context.pattern = null; context.input = ''; }
}
parentPort.on('message', ({ id, candidate }) => {
  const path = candidate.filePath.replace(/\\/g, '/').toLowerCase();
  const line = candidate.line.toLowerCase();
  const ruleId = candidate.ruleId.toLowerCase();
  const matched = rules.some(rule => {
    if (rule.kind === 'path') return path.includes(rule.value);
    if (rule.kind === 'text') return path.includes(rule.value) || line.includes(rule.value) || ruleId.includes(rule.value);
    return regex(rule, candidate.line) || regex(rule, candidate.filePath);
  });
  parentPort.postMessage({ id, matched, timedOutCount: rules.filter(rule => rule.kind === 'regex' && rule.timedOut).length });
});
`;

/** Repository regexes run under the same watchdog, without blocking Electron's event loop. */
export class SecretAllowlistMatcher {
  private worker?: Worker;
  private nextId = 0;
  private failure?: Error;
  private closed = false;
  private stopping?: Promise<void>;
  private readonly pending = new Map<number, { resolve: (match: boolean) => void; reject: (error: unknown) => void }>();
  timedOutCount = 0;
  constructor(
    private readonly rules: SecretAllowlistRule[],
    private readonly signal?: AbortSignal,
  ) {}
  private readonly abort = () => {
    void this.dispose(this.signal?.reason).catch(() => undefined);
  };
  private start() {
    this.signal?.throwIfAborted();
    if (this.closed) throw this.failure ?? new DOMException('Secret allowlist matcher is closed.', 'AbortError');
    if (this.worker) return this.worker;
    const task = new Worker(SOURCE, { eval: true, workerData: this.rules });
    this.worker = task;
    this.signal?.addEventListener('abort', this.abort, { once: true });
    task.on('message', (data: { id: number; matched: boolean; timedOutCount: number }) => {
      this.timedOutCount = data.timedOutCount;
      this.pending.get(data.id)?.resolve(data.matched);
      this.pending.delete(data.id);
    });
    const fail = (error: Error) => {
      if (this.closed) return;
      this.failure = new Error(`Secret allowlist matcher failed: ${error.message}`);
      void this.dispose(this.failure).catch(() => undefined);
    };
    task.once('error', fail);
    task.once('exit', () => fail(new Error('The worker stopped before matching completed.')));
    return task;
  }
  async test(candidate: Candidate): Promise<boolean> {
    const task = this.start();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        task.postMessage({ id, candidate });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async dispose(reason: unknown = new DOMException('Secret scan was aborted.', 'AbortError')): Promise<void> {
    if (this.stopping) return this.stopping;
    this.closed = true;
    this.signal?.removeEventListener('abort', this.abort);
    for (const entry of this.pending.values()) entry.reject(reason);
    this.pending.clear();
    const task = this.worker;
    this.worker = undefined;
    this.stopping = task ? task.terminate().then(() => undefined) : Promise.resolve();
    await this.stopping;
  }
}
