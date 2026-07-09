import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ConflictEditorState, GitStatusWithConflicts } from './types';

type Params = {
  status: GitStatusWithConflicts | null;
  conflictEditor: ConflictEditorState | null;
  setConflictEditor: Dispatch<SetStateAction<ConflictEditorState | null>>;
  setSelectedConflictBlockIndex: Dispatch<SetStateAction<number>>;
  openConflictEditor: (filePath: string, initialBlockIndex?: number) => Promise<void> | void;
  initialConflictPath?: string | null;
  isConflictOnly: boolean;
  onOpenConflictResolver?: (filePath: string) => void;
};

export const useConflictAutoOpen = ({
  status,
  conflictEditor,
  setConflictEditor,
  setSelectedConflictBlockIndex,
  openConflictEditor,
  initialConflictPath,
  isConflictOnly,
  onOpenConflictResolver,
}: Params) => {
  const autoOpenedConflictPathRef = useRef<string | null>(null);
  const appliedInitialConflictPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (onOpenConflictResolver && !isConflictOnly) return;
    if (!status || status.conflicts.length === 0) {
      autoOpenedConflictPathRef.current = null;
      setConflictEditor(null);
      setSelectedConflictBlockIndex(0);
      return;
    }
    const activePath = conflictEditor?.filePath || null;
    const activeStillConflicting = activePath ? status.conflicts.some((entry) => entry.path === activePath) : false;
    if (activeStillConflicting) {
      autoOpenedConflictPathRef.current = activePath;
      return;
    }
    const nextPath = status.conflicts[0]?.path;
    if (!nextPath) return;
    if (!activePath && autoOpenedConflictPathRef.current === nextPath) return;
    autoOpenedConflictPathRef.current = nextPath;
    void openConflictEditor(nextPath);
  }, [status, conflictEditor, openConflictEditor, onOpenConflictResolver, isConflictOnly, setConflictEditor, setSelectedConflictBlockIndex]);

  useEffect(() => {
    if (!isConflictOnly) {
      appliedInitialConflictPathRef.current = null;
      return;
    }
    if (!initialConflictPath) return;
    if (!status || status.conflicts.length === 0) return;
    if (appliedInitialConflictPathRef.current === initialConflictPath) return;
    if (!status.conflicts.some((entry) => entry.path === initialConflictPath)) return;
    appliedInitialConflictPathRef.current = initialConflictPath;
    if (conflictEditor?.filePath === initialConflictPath) return;
    void openConflictEditor(initialConflictPath);
  }, [isConflictOnly, initialConflictPath, status, conflictEditor?.filePath, openConflictEditor]);
};
