import type { App } from 'electron';

/** Electron does not await event handlers. Finish durable cache writes before exiting. */
export function finishBeforeQuit(application: Pick<App, 'on' | 'quit'>, cleanup: () => Promise<void>): void {
  let closing = false,
    completed = false;
  application.on('before-quit', (event) => {
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
        application.quit();
      });
  });
}
