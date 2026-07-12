export type WorkingDirectoryNavigationTarget = { kind: 'file'; path: string } | { kind: 'view'; label: string } | { kind: 'repository'; path: string };

export type WorkingDirectoryNavigationGuard = (target: WorkingDirectoryNavigationTarget, proceed: () => void, cancel?: () => void) => void;

let activeGuard: WorkingDirectoryNavigationGuard | null = null;
let isProceeding = false;
let activeRequest: { cancel: () => void } | null = null;

export const runWorkingDirectoryNavigationAction = (action: () => void): void => {
  const wasProceeding = isProceeding;
  isProceeding = true;
  try {
    action();
  } finally {
    isProceeding = wasProceeding;
  }
};

export const setActiveWorkingDirectoryNavigationGuard = (guard: WorkingDirectoryNavigationGuard | null): void => {
  activeGuard = guard;
  if (!guard && activeRequest) activeRequest.cancel();
};

export const requestWorkingDirectoryNavigation = (target: WorkingDirectoryNavigationTarget, proceed: () => void, cancel?: () => void): void => {
  if (!activeGuard || isProceeding) {
    proceed();
    return;
  }
  activeRequest?.cancel();
  const request = {
    cancel: () => {
      if (activeRequest !== request) return;
      activeRequest = null;
      cancel?.();
    },
  };
  activeRequest = request;
  activeGuard(
    target,
    () => {
      if (activeRequest !== request) return;
      activeRequest = null;
      runWorkingDirectoryNavigationAction(() => {
        proceed();
      });
    },
    request.cancel,
  );
};

export const confirmWorkingDirectoryNavigation = (target: WorkingDirectoryNavigationTarget): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    requestWorkingDirectoryNavigation(
      target,
      () => resolve(true),
      () => resolve(false),
    );
  });

export const resetWorkingDirectoryNavigationGuardForTests = (): void => {
  activeGuard = null;
  isProceeding = false;
  activeRequest?.cancel();
  activeRequest = null;
};
