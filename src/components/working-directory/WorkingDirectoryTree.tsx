import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, File, Folder, FolderOpen, Scissors, Trash2 } from 'lucide-react';
import { useUIContext } from '@/contexts/AppStateContext';
import { useToastQueue } from '@/hooks/useToastQueue';
import { gitClient } from '@/services/gitClient';
import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import '@/styles/working-directory-tree.css';

type ClipboardEntry = { path: string; cut: boolean } | null;
type Props = {
  repoPath: string | null;
  refreshTrigger: number;
  expandedPaths: Set<string>;
  onExpandedPathsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenFile: (path: string) => void;
  onRepoChanged: () => void;
};

const basename = (value: string) => value.split('/').pop() || value;

export const WorkingDirectoryTree: React.FC<Props> = ({ repoPath, refreshTrigger, expandedPaths, onExpandedPathsChange, onOpenFile, onRepoChanged }) => {
  const { setConfirmDialog, setInputDialog } = useUIContext();
  const { toasts, setToast, dismiss } = useToastQueue(3000);
  const [entries, setEntries] = useState<WorkingDirectoryEntryDto[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardEntry>(null);
  const [context, setContext] = useState<{ entry: WorkingDirectoryEntryDto; x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) return;
    const result = await gitClient.listWorkingDirectory(repoPath);
    if (result.success) setEntries(result.data || []);
    else setToast({ msg: result.error || 'Could not load working directory.', isError: true });
  }, [repoPath, setToast]);
  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);
  useEffect(() => {
    const close = () => setContext(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, WorkingDirectoryEntryDto[]>();
    for (const entry of entries) {
      const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
      map.set(parent, [...(map.get(parent) || []), entry]);
    }
    for (const values of map.values()) values.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
    return map;
  }, [entries]);

  const runMutation = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    const result = await action();
    if (!result.success) {
      setToast({ msg: result.error || 'File operation failed.', isError: true });
      return false;
    }
    await load();
    onRepoChanged();
    return true;
  };
  const pasteInto = (folder: string) => {
    if (!clipboard || !repoPath) return;
    const targetPath = folder ? `${folder}/${basename(clipboard.path)}` : basename(clipboard.path);
    const execute = async (overwrite: boolean) =>
      runMutation(() =>
        clipboard.cut
          ? gitClient.moveWorkingDirectoryEntry(clipboard.path, targetPath, overwrite, repoPath)
          : gitClient.copyWorkingDirectoryEntry(clipboard.path, targetPath, overwrite, repoPath),
      );
    const exists = entries.some((entry) => entry.path === targetPath);
    if (exists)
      setConfirmDialog({
        variant: 'danger',
        title: 'Replace existing entry?',
        message: `"${targetPath}" already exists.`,
        contextItems: [{ label: 'Target', value: targetPath }],
        irreversible: true,
        consequences: 'The existing file or folder will be replaced.',
        confirmLabel: 'Replace',
        onConfirm: async () => {
          if ((await execute(true)) && clipboard.cut) setClipboard(null);
        },
      });
    else
      void execute(false).then((ok) => {
        if (ok && clipboard.cut) setClipboard(null);
      });
  };
  const rename = (entry: WorkingDirectoryEntryDto) =>
    setInputDialog({
      title: 'Rename',
      message: `Rename ${entry.name}`,
      fields: [{ id: 'name', label: 'Name', defaultValue: entry.name, required: true }],
      contextItems: [{ label: 'Path', value: entry.path }],
      irreversible: false,
      consequences: 'The repository working tree will change.',
      confirmLabel: 'Rename',
      onSubmit: async (values) => {
        const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
        const target = parent ? `${parent}/${values.name}` : values.name;
        const exists = entries.some((item) => item.path === target);
        if (exists) {
          setToast({ msg: 'A file or folder with that name already exists.', isError: true });
          return;
        }
        await runMutation(() => gitClient.moveWorkingDirectoryEntry(entry.path, target, false, repoPath!));
      },
    });
  const remove = (entry: WorkingDirectoryEntryDto) =>
    setConfirmDialog({
      variant: 'danger',
      title: 'Delete permanently?',
      message: `Delete "${entry.name}" from the working directory?`,
      contextItems: [{ label: 'Path', value: entry.path }],
      irreversible: true,
      consequences: entry.kind === 'directory' ? 'All files inside this folder will be deleted.' : 'This file will be deleted.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await runMutation(() => gitClient.deleteWorkingDirectoryEntry(entry.path, repoPath!));
      },
    });
  const render = (parent: string, ancestorIsLast: boolean[] = []): React.ReactNode =>
    (childrenByParent.get(parent) || []).map((entry, index, siblings) => {
      const open = expandedPaths.has(entry.path);
      const isLast = index === siblings.length - 1;
      return (
        <React.Fragment key={entry.path}>
          <button
            type="button"
            className="working-tree-row"
            onClick={() =>
              entry.kind === 'directory'
                ? onExpandedPathsChange((current) => {
                    const next = new Set(current);
                    open ? next.delete(entry.path) : next.add(entry.path);
                    return next;
                  })
                : onOpenFile(entry.path)
            }
            onContextMenu={(event) => {
              event.preventDefault();
              setContext({ entry, x: event.clientX, y: event.clientY });
            }}
          >
            <span className="working-tree-row__guide" aria-hidden>
              {ancestorIsLast.map((ancestorLast, ancestorIndex) => (
                <span key={ancestorIndex}>{ancestorLast ? '    ' : '│   '}</span>
              ))}
              {isLast ? '└──' : '├──'}
            </span>
            {entry.kind === 'directory' ? (
              open ? (
                <FolderOpen className="working-tree-row__icon working-tree-row__icon--directory" size={15} strokeWidth={1.8} />
              ) : (
                <Folder className="working-tree-row__icon working-tree-row__icon--directory" size={15} strokeWidth={1.8} />
              )
            ) : (
              <File className="working-tree-row__icon working-tree-row__icon--file" size={15} strokeWidth={1.8} />
            )}
            <span className="working-tree-row__label">{entry.name}</span>
          </button>
          {entry.kind === 'directory' && open && render(entry.path, [...ancestorIsLast, isLast])}
        </React.Fragment>
      );
    });
  const targetFolder =
    context?.entry.kind === 'directory'
      ? context.entry.path
      : context?.entry.path.includes('/')
        ? context.entry.path.slice(0, context.entry.path.lastIndexOf('/'))
        : '';
  return (
    <div className="working-directory-tree">
      <div
        className="working-tree-root"
        onContextMenu={(event) => {
          event.preventDefault();
          setContext({ entry: { path: '', name: 'Repository', kind: 'directory' }, x: event.clientX, y: event.clientY });
        }}
      >
        <FolderOpen className="working-tree-root__icon" size={16} strokeWidth={1.8} />
        <span className="working-tree-root__label">{repoPath ? `${basename(repoPath)}/` : 'Repository/'}</span>
      </div>
      {render('')}
      {context && (
        <div
          className="staging-context-menu"
          style={{ position: 'fixed', left: context.x, top: context.y, zIndex: 50 }}
          onClick={(event) => event.stopPropagation()}
        >
          {context.entry.path && context.entry.kind === 'file' && <button onClick={() => onOpenFile(context.entry.path)}>Open</button>}
          {context.entry.path && <button onClick={() => rename(context.entry)}>Rename</button>}
          {context.entry.path && (
            <button onClick={() => setClipboard({ path: context.entry.path, cut: false })}>
              <Copy size={14} />
              Copy
            </button>
          )}
          {context.entry.path && (
            <button onClick={() => setClipboard({ path: context.entry.path, cut: true })}>
              <Scissors size={14} />
              Cut
            </button>
          )}
          {clipboard && <button onClick={() => pasteInto(targetFolder)}>Paste</button>}
          {context.entry.path && (
            <button onClick={() => void gitClient.openRepositoryPath({ path: context.entry.path, action: 'reveal', repoPath: repoPath! })}>
              Show in file system
            </button>
          )}
          {context.entry.path && (
            <button onClick={() => void gitClient.openRepositoryPath({ path: context.entry.path, action: 'open', repoPath: repoPath! })}>
              Open externally
            </button>
          )}
          {context.entry.path && (
            <button onClick={() => void gitClient.openRepositoryPath({ path: context.entry.path, action: 'openWith', repoPath: repoPath! })}>Open with</button>
          )}
          {context.entry.path && (
            <button onClick={() => remove(context.entry)}>
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      )}
      <ActionToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};
