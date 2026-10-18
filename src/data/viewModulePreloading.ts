import { getViewModule, preloadViewModule, viewModules } from './viewModules';

const IDLE_DELAY_MS = 1000;
const idleModules = ['repo', 'hosting', 'planner', 'settings', 'analytics', 'file', 'editor', 'timeline'] as const;

/** Active navigation bypasses speculative work. Each further import gets a new
 * idle period after a paint and a delay; imports already begun cannot
 * be cancelled, but navigation and visibility changes cancel every queued one. */
export function scheduleViewModulePreloads(activeView: string): () => void {
  const active = getViewModule(activeView);
  const remaining = idleModules.filter((name) => viewModules[name] !== active);
  let disposed = false;
  let activeReady = false;
  let running = false;
  let frame: number | undefined;
  let timer: number | undefined;
  let idle: number | undefined;

  const cancelScheduled = () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    if (timer !== undefined) window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    frame = timer = idle = undefined;
  };
  const visible = () => !disposed && document.visibilityState !== 'hidden';
  const schedule = () => {
    if (!visible() || !activeReady || running || frame !== undefined || timer !== undefined || idle !== undefined) return;
    if (!remaining.some((name) => !viewModules[name].isReady())) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!visible()) return;
        // Do not force speculative imports through an idle timeout on busy machines.
        if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(loadNext);
        else loadNext();
      }, IDLE_DELAY_MS);
    });
  };
  const loadNext = (deadline?: IdleDeadline) => {
    idle = undefined;
    if (!visible()) return;
    if (deadline && deadline.timeRemaining() < 8) {
      schedule();
      return;
    }
    const index = remaining.findIndex((name) => !viewModules[name].isReady());
    if (index < 0) return;
    const [name] = remaining.splice(index, 1);
    running = true;
    void preloadViewModule(name).finally(() => {
      running = false;
      schedule();
    });
  };
  const visibilityChanged = () => {
    cancelScheduled();
    schedule();
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  void preloadViewModule(activeView).then(() => {
    activeReady = true;
    schedule();
  });
  return () => {
    disposed = true;
    cancelScheduled();
    document.removeEventListener('visibilitychange', visibilityChanged);
  };
}
