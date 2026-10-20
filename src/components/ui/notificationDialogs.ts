import { useCallback, useEffect, useState } from 'react';

const dialogs = new Set<number>();
const pending = new Map<symbol, { priority: number; open: () => void }>();
let active: symbol | null = null;
let scheduled = false;

function flush() {
  scheduled = false;
  if (dialogs.size || active || !pending.size) return;
  const [token, request] = [...pending].sort(([, a], [, b]) => a.priority - b.priority)[0];
  pending.delete(token);
  active = token;
  request.open();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(flush);
}

export function registerOpenDialog(id: number): () => void {
  dialogs.add(id);
  return () => {
    dialogs.delete(id);
    schedule();
  };
}

/** Update promotions have priority 0; user notes wait at priority 1. */
export function useNotificationDialog(priority: number) {
  const [token] = useState(() => Symbol('notification-dialog'));
  const [dialogOpen, setDialogOpen] = useState(false);
  const cancelPendingDialog = useCallback(() => {
    pending.delete(token);
  }, [token]);
  const openDialog = useCallback(
    (automatic = false) => {
      if (active === token) return;
      pending.set(token, { priority, open: () => setDialogOpen(true) });
      if (automatic) schedule();
      else flush();
    },
    [priority, token],
  );
  const closeDialog = useCallback(() => {
    pending.delete(token);
    if (active === token) active = null;
    setDialogOpen(false);
    schedule();
  }, [token]);
  useEffect(
    () => () => {
      pending.delete(token);
      if (active === token) active = null;
      schedule();
    },
    [token],
  );
  return { dialogOpen, openDialog, closeDialog, cancelPendingDialog };
}
