import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmWorkingDirectoryNavigation,
  requestWorkingDirectoryNavigation,
  resetWorkingDirectoryNavigationGuardForTests,
  setActiveWorkingDirectoryNavigationGuard,
} from './workingDirectoryNavigationGuard';

afterEach(() => resetWorkingDirectoryNavigationGuardForTests());

describe('workingDirectoryNavigationGuard', () => {
  it('defers navigation until the dirty editor allows it', () => {
    let allow: (() => void) | undefined;
    setActiveWorkingDirectoryNavigationGuard((_target, proceed) => {
      allow = proceed;
    });
    const navigate = vi.fn();

    requestWorkingDirectoryNavigation({ kind: 'view', label: 'settings' }, navigate);
    expect(navigate).not.toHaveBeenCalled();
    allow?.();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('settles a cancelled async navigation and cancels an older request when a newer one replaces it', async () => {
    const requests: Array<{ proceed: () => void; cancel?: () => void }> = [];
    setActiveWorkingDirectoryNavigationGuard((_target, proceed, cancel) => requests.push({ proceed, cancel }));

    const first = confirmWorkingDirectoryNavigation({ kind: 'repository', path: 'C:/repo-b' });
    const second = confirmWorkingDirectoryNavigation({ kind: 'view', label: 'timeline' });

    await expect(first).resolves.toBe(false);
    requests[1]?.cancel?.();
    await expect(second).resolves.toBe(false);
  });

  it('does not open a second guard while an allowed compound navigation proceeds', () => {
    const guard = vi.fn((_target, proceed: () => void) => proceed());
    setActiveWorkingDirectoryNavigationGuard(guard);
    const nested = vi.fn();

    requestWorkingDirectoryNavigation({ kind: 'view', label: 'release' }, () => {
      requestWorkingDirectoryNavigation({ kind: 'view', label: 'repo' }, nested);
    });

    expect(guard).toHaveBeenCalledTimes(1);
    expect(nested).toHaveBeenCalledTimes(1);
  });
});
