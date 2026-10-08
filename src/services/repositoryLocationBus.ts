type LocationChange = { oldPath: string; newPath: string };
const listeners = new Set<(change: LocationChange) => void>();
export const onRepositoryLocationChanged = (listener: (change: LocationChange) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const notifyRepositoryLocationChanged = (change: LocationChange): void => {
  for (const listener of listeners) {
    try {
      listener(change);
    } catch {
      // A UI subscriber cannot undo a successfully persisted location change.
    }
  }
};
