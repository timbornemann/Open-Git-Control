import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Copy, ExternalLink, File, Folder, FolderOpen, Pencil, Scissors, Trash2 } from 'lucide-react';
import { useUIContext } from '@/contexts/AppStateContext';
import { useToastQueue } from '@/hooks/useToastQueue';
import { gitClient } from '@/services/gitClient';
import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';
import { ActionToastViewport } from '@/components/ActionToastViewport';
import { getAvailableWorkingDirectoryCopyPath } from '@/utils/workingDirectoryCopyName';
import '@/styles/working-directory-tree.css';

type ClipboardEntry = { path: string; kind: WorkingDirectoryEntryDto['kind']; cut: boolean } | null;
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
    if (clipboard.cut && clipboard.path === targetPath) {
      setClipboard(null);
      return;
    }
    const execute = async (destinationPath: string, overwrite: boolean) =>
      runMutation(() =>
        clipboard.cut
          ? gitClient.moveWorkingDirectoryEntry(clipboard.path, destinationPath, overwrite, repoPath)
          : gitClient.copyWorkingDirectoryEntry(clipboard.path, destinationPath, overwrite, repoPath),
      );
    const exists = entries.some((entry) => entry.path === targetPath);
    if (exists) {
      const copyTargetPath = getAvailableWorkingDirectoryCopyPath(
        targetPath,
        clipboard.kind,
        entries.map((entry) => entry.path),
      );
      setConfirmDialog({
        variant: 'danger',
        title: 'Replace existing entry?',
        message: `"${targetPath}" already exists.`,
        contextItems: [{ label: 'Target', value: targetPath }],
        irreversible: true,
        consequences: clipboard.cut
          ? 'The existing file or folder will be replaced.'
          : 'Replace the existing entry, or create a separately named copy instead.',
        confirmLabel: 'Replace',
        onConfirm: async () => {
          if ((await execute(targetPath, true)) && clipboard.cut) setClipboard(null);
        },
        ...(clipboard.cut
          ? {}
          : {
              secondaryActionLabel: 'Keep both',
              secondaryActionVariant: 'default' as const,
              onSecondaryAction: async () => {
                await execute(copyTargetPath, false);
              },
            }),
      });
    } else
      void execute(targetPath, false).then((ok) => {
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
          className="working-tree-context-menu"
          style={{ position: 'fixed', left: context.x, top: context.y, zIndex: 50 }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
          aria-label="File actions"
        >
          <div className="working-tree-context-menu__header">{context.entry.path || (repoPath ? basename(repoPath) : 'Repository')}</div>
          {context.entry.path && context.entry.kind === 'file' && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setContext(null);
                onOpenFile(context.entry.path);
              }}
            >
              <File size={14} />
              <span>Open</span>
            </button>
          )}
          {context.entry.path && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setContext(null);
                rename(context.entry);
              }}
            >
              <Pencil size={14} />
              <span>Rename</span>
            </button>
          )}
          {context.entry.path && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setClipboard({ path: context.entry.path, kind: context.entry.kind, cut: false });
                setContext(null);
              }}
            >
              <Copy size={14} />
              <span>Copy</span>
            </button>
          )}
          {context.entry.path && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setClipboard({ path: context.entry.path, kind: context.entry.kind, cut: true });
                setContext(null);
              }}
            >
              <Scissors size={14} />
              <span>Cut</span>
            </button>
          )}
          {clipboard && (
            <>
              <div className="working-tree-context-menu__separator" />
              <button
                type="button"
                className="working-tree-context-menu__item"
                onClick={() => {
                  setContext(null);
                  pasteInto(targetFolder);
                }}
              >
                <ClipboardPaste size={14} />
                <span>Paste</span>
              </button>
            </>
          )}
          {context.entry.path && <div className="working-tree-context-menu__separator" />}
          {context.entry.path && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setContext(null);
                void gitClient.openRepositoryPath({ path: context.entry.path, action: 'reveal', repoPath: repoPath! });
              }}
            >
              <FolderOpen size={14} />
              <span>Show in file system</span>
            </button>
          )}
          {context.entry.path && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setContext(null);
                void gitClient.openRepositoryPath({ path: context.entry.path, action: 'open', repoPath: repoPath! });
              }}
            >
              <ExternalLink size={14} />
              <span>Open externally</span>
            </button>
          )}
          {context.entry.path && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setContext(null);
                void gitClient.openRepositoryPath({ path: context.entry.path, action: 'openWith', repoPath: repoPath! });
              }}
            >
              <ExternalLink size={14} />
              <span>Open with</span>
            </button>
          )}
          {context.entry.path && (
            <>
              <div className="working-tree-context-menu__separator" />
              <button
                type="button"
                className="working-tree-context-menu__item working-tree-context-menu__item--danger"
                onClick={() => {
                  setContext(null);
                  remove(context.entry);
                }}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}
      <ActionToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};
