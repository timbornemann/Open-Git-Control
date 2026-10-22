import { useEffect, type RefObject } from 'react';
import { isShortcutSuppressed } from '@/hooks/keyboardShortcutRuntime';
import { consumeCommitShortcutRequest, useCommitShortcutRequest } from './commitShortcutState';

// Staging stays mounted behind the working-directory tree. Never submit its
// hidden form; the application first reveals it through guarded navigation.
const isVisible = (element: HTMLElement | null): boolean => {
  if (!element?.isConnected) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.style.display === 'none' || current.style.visibility === 'hidden') return false;
  }
  return true;
};

export function useCommitShortcut({
  panelRef,
  repoPath,
  disabled,
  hasMessage,
  commit,
}: {
  panelRef: RefObject<HTMLDivElement>;
  repoPath: string | null;
  disabled: boolean;
  hasMessage: boolean;
  commit: () => Promise<void>;
}) {
  const request = useCommitShortcutRequest((state) => state.request);
  useEffect(() => {
    if (!request || request.repoPath !== repoPath || !isVisible(panelRef.current)) return;
    if (!consumeCommitShortcutRequest(request) || isShortcutSuppressed() || disabled) return;
    if (hasMessage) void commit();
    else panelRef.current?.querySelector<HTMLTextAreaElement>('textarea[id$="-message"]')?.focus();
  }, [request, repoPath, panelRef, disabled, hasMessage, commit]);
}
