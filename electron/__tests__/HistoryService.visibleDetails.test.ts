import { describe, expect, it, vi } from 'vitest';
import { GitScheduler } from '../GitScheduler';
import { HistoryService } from '../git/HistoryService';

describe('visible file details alongside diff previews', () => {
  it.each(['log', 'ls-tree', 'blame'])('keeps the %s read alive when a foreground diff starts', async (heldCommand) => {
    const scheduler = new GitScheduler();
    let finish!: (value: string) => void;
    let startedSignal: AbortSignal | undefined;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const service = new HistoryService(vi.fn(), (repo, args, signal, kind = 'background') =>
      scheduler.schedule(
        repo,
        kind,
        args[0],
        async (runningSignal) => {
          if (args[0] !== heldCommand) return args[0] === 'ls-tree' ? 'file.ts\n' : 'blame contents';
          startedSignal = runningSignal;
          return new Promise<string>((resolve, reject) => {
            const cancel = () => reject(Object.assign(new Error('File detail read was aborted'), { name: 'AbortError' }));
            runningSignal.addEventListener('abort', cancel, { once: true });
            void pending.then((value) => {
              runningSignal.removeEventListener('abort', cancel);
              resolve(value);
            });
          });
        },
        { signal },
      ),
    );
    const details =
      heldCommand === 'log'
        ? service.getFileHistory('file.ts', 80, 'a'.repeat(40), 'C:/repo')
        : service.getFileBlameRange('file.ts', 'a'.repeat(40), 1, 501, 'C:/repo');
    try {
      await vi.waitFor(() => expect(startedSignal).toBeDefined());
      await scheduler.schedule('C:/repo', 'interactive', 'diff', async () => 'diff contents');
      expect(startedSignal?.aborted).toBe(false);
    } finally {
      finish(heldCommand === 'ls-tree' ? 'file.ts\n' : 'detail contents');
    }
    await expect(details).resolves.toBe(heldCommand === 'ls-tree' ? 'blame contents' : 'detail contents');
    expect(scheduler.getDiagnostics()).toContainEqual(expect.objectContaining({ command: heldCommand, kind: 'interactive', aborted: false }));
  });
});
