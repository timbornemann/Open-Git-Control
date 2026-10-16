import type { App } from 'electron';

/** Electron does not await event handlers. Finish durable cache writes before exiting. */
export function finishBeforeQuit(application: Pick<App, 'on' | 'quit'>, cleanup: () => Promise<void>): void {
  let closing = false,
    completed = false;
  // before-quit precedes window close guards. A cancelled close must leave
  // services alive; will-quit runs only after window closure was confirmed.
  application.on('will-quit', (event) => {
    if (completed) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void Promise.resolve()
      .then(cleanup)
      .catch((error) => {
        console.error('Application shutdown cleanup failed:', error);
      })
      .finally(() => {
        completed = true;
        // Promise callbacks can run before Electron unwinds the cancelled
        // native quit. A reentrant quit is ignored, leaving a windowless
        // process that still owns the single-instance lock and program files.
        setImmediate(() => application.quit());
      });
  });
}
