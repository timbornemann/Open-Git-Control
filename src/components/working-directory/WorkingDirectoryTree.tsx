import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ClipboardPaste, Copy, ExternalLink, File, FilePlus, Folder, FolderOpen, FolderPlus, Info, Pencil, Scissors, Trash2 } from 'lucide-react';
import { useUIContext } from '@/contexts/AppStateContext';
import { useAppToastSetter } from '@/hooks/useAppToast';
import { gitClient } from '@/services/gitClient';
import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';
import { getAvailableWorkingDirectoryCopyPath } from '@/utils/workingDirectoryCopyName';
import { WorkingDirectoryFileInfoDialog } from './WorkingDirectoryFileInfoDialog';
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
const isEntryName = (value: string) => value.length > 0 && value !== '.' && value !== '..' && !/[\\/]/.test(value);

export const WorkingDirectoryTree: React.FC<Props> = ({ repoPath, refreshTrigger, expandedPaths, onExpandedPathsChange, onOpenFile, onRepoChanged }) => {
  const { setConfirmDialog, setInputDialog } = useUIContext();
  const setToast = useAppToastSetter();
  const [entriesByParent, setEntriesByParent] = useState<Record<string, WorkingDirectoryEntryDto[]>>({});
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set());
  const [clipboard, setClipboard] = useState<ClipboardEntry>(null);
  const [context, setContext] = useState<{ entry: WorkingDirectoryEntryDto; x: number; y: number } | null>(null);
  const [fileInfoPath, setFileInfoPath] = useState<string | null>(null);
  const activeRepoPathRef = useRef(repoPath);
  const loadedDirectoryPathsRef = useRef(new Set<string>());
  const initializedRepoPathRef = useRef<string | null>(null);
  const expandedPathsRef = useRef(expandedPaths);
  activeRepoPathRef.current = repoPath;
  expandedPathsRef.current = expandedPaths;
  const removeDirectoryFromTreeCache = useCallback(
    (directoryPath: string) => {
      const isRemovedDirectory = (candidatePath: string) => candidatePath === directoryPath || candidatePath.startsWith(`${directoryPath}/`);
      loadedDirectoryPathsRef.current = new Set([...loadedDirectoryPathsRef.current].filter((loadedPath) => !isRemovedDirectory(loadedPath)));
      onExpandedPathsChange((current) => new Set([...current].filter((expandedPath) => !isRemovedDirectory(expandedPath))));
    },
    [onExpandedPathsChange],
  );
  const loadDirectory = useCallback(
    async (parentPath = '', options?: { silent?: boolean }): Promise<WorkingDirectoryEntryDto[]> => {
      if (!repoPath || !gitClient.isAvailable()) return [];
      const repoAtStart = repoPath;
      setLoadingDirectories((current) => new Set(current).add(parentPath));
      try {
        const result = await gitClient.listWorkingDirectory(repoAtStart, parentPath);
        if (activeRepoPathRef.current !== repoAtStart) return [];
        if (!result.success) {
          if (parentPath && /\bENOENT\b/.test(result.error || '')) {
            removeDirectoryFromTreeCache(parentPath);
            return [];
          }
          loadedDirectoryPathsRef.current.delete(parentPath);
          if (!options?.silent) setToast({ msg: result.error || 'Could not load working directory.', isError: true });
          return [];
        }
        const entries = result.data || [];
        loadedDirectoryPathsRef.current.add(parentPath);
        setEntriesByParent((current) => ({ ...current, [parentPath]: entries }));
        return entries;
      } finally {
        setLoadingDirectories((current) => {
          const next = new Set(current);
          next.delete(parentPath);
          return next;
        });
      }
    },
    [removeDirectoryFromTreeCache, repoPath, setToast],
  );

  const refreshLoadedDirectories = useCallback(async () => {
    const paths = new Set(loadedDirectoryPathsRef.current);
    // Always include root so a transient initial failure recovers on refresh.
    paths.add('');
    await Promise.all([...paths].map((parentPath) => loadDirectory(parentPath)));
  }, [loadDirectory]);

  useLayoutEffect(() => {
    if (initializedRepoPathRef.current !== repoPath) {
      // A null ref means a fresh mount rather than a repo switch. The tree can be
      // unmounted (e.g. when a commit or file inspector takes over) while the
      // expanded-path set lives on in the parent, so on remount our local entry
      // cache is empty yet folders are still marked open. Re-hydrate every
      // expanded directory so open folders show their children immediately
      // instead of appearing open-but-empty until the user clicks them twice.
      const isFreshMount = initializedRepoPathRef.current === null;
      initializedRepoPathRef.current = repoPath;
      loadedDirectoryPathsRef.current.clear();
      setEntriesByParent({});
      setLoadingDirectories(new Set());
      setClipboard(null);
      setContext(null);
      setFileInfoPath(null);
      if (repoPath) {
        void loadDirectory('');
        if (isFreshMount) {
          for (const expandedPath of expandedPathsRef.current) {
            if (expandedPath) void loadDirectory(expandedPath, { silent: true });
          }
        }
      }
      return;
    }
    if (repoPath) void refreshLoadedDirectories();
  }, [loadDirectory, refreshLoadedDirectories, refreshTrigger, repoPath]);

  useEffect(() => {
    const close = () => setContext(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const runMutation = async (action: () => Promise<{ success: boolean; error?: string }>, removedDirectories: string[] = []) => {
    const result = await action();
    if (!result.success) {
      setToast({ msg: result.error || 'File operation failed.', isError: true });
      return false;
    }
    removedDirectories.forEach(removeDirectoryFromTreeCache);
    await refreshLoadedDirectories();
    onRepoChanged();
    return true;
  };
  const pasteInto = async (folder: string) => {
    if (!clipboard || !repoPath) return;
    const targetPath = folder ? `${folder}/${basename(clipboard.path)}` : basename(clipboard.path);
    if (clipboard.cut && clipboard.path === targetPath) {
      setClipboard(null);
      return;
    }
    const execute = async (destinationPath: string, overwrite: boolean) =>
      runMutation(
        () =>
          clipboard.cut
            ? gitClient.moveWorkingDirectoryEntry(clipboard.path, destinationPath, overwrite, repoPath)
            : gitClient.copyWorkingDirectoryEntry(clipboard.path, destinationPath, overwrite, repoPath),
        clipboard.cut && clipboard.kind === 'directory' ? [clipboard.path] : [],
      );
    const destinationEntries = entriesByParent[folder] || (await loadDirectory(folder));
    const exists = destinationEntries.some((entry) => entry.path === targetPath);
    if (exists) {
      const copyTargetPath = getAvailableWorkingDirectoryCopyPath(
        targetPath,
        clipboard.kind,
        destinationEntries.map((entry) => entry.path),
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
        const exists = (entriesByParent[parent] || []).some((item) => item.path === target);
        if (exists) {
          setToast({ msg: 'A file or folder with that name already exists.', isError: true });
          return;
        }
        await runMutation(() => gitClient.moveWorkingDirectoryEntry(entry.path, target, false, repoPath!), entry.kind === 'directory' ? [entry.path] : []);
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
        await runMutation(() => gitClient.deleteWorkingDirectoryEntry(entry.path, repoPath!), entry.kind === 'directory' ? [entry.path] : []);
      },
    });
  const createEntry = (folder: string, kind: 'file' | 'folder') =>
    setInputDialog({
      title: kind === 'file' ? 'Add file' : 'Add folder',
      message: folder ? `Create a new ${kind} in "${folder}".` : `Create a new ${kind} in the repository root.`,
      fields: [
        {
          id: 'name',
          label: kind === 'file' ? 'File name' : 'Folder name',
          helperText: kind === 'file' ? 'Include the file extension, for example "notes.md".' : 'Enter a single folder name.',
          required: true,
          validate: (value) => (isEntryName(value) ? null : `Enter a ${kind} name, not a path.`),
        },
      ],
      contextItems: [{ label: 'Folder', value: folder || 'Repository root' }],
      irreversible: false,
      consequences: kind === 'file' ? 'An empty file will be added to the working directory.' : 'A folder will be added to the working directory.',
      confirmLabel: kind === 'file' ? 'Add file' : 'Add folder',
      onSubmit: async (values) => {
        const name = values.name ?? '';
        if (!isEntryName(name)) {
          setToast({ msg: `Enter a ${kind} name, not a path.`, isError: true });
          return;
        }
        const targetPath = folder ? `${folder}/${name}` : name;
        const exists = (entriesByParent[folder] || []).some((entry) => entry.path === targetPath);
        if (exists) {
          setToast({ msg: 'A file or folder with that name already exists.', isError: true });
          return;
        }
        await runMutation(() =>
          kind === 'file' ? gitClient.createWorkingDirectoryFile(targetPath, repoPath!) : gitClient.createWorkingDirectoryFolder(targetPath, repoPath!),
        );
      },
    });
  const render = (parent: string, ancestorIsLast: boolean[] = []): React.ReactNode =>
    (entriesByParent[parent] || [])
      .slice()
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1))
      .map((entry, index, siblings) => {
        const open = expandedPaths.has(entry.path);
        const isLast = index === siblings.length - 1;
        const loading = loadingDirectories.has(entry.path);
        return (
          <React.Fragment key={entry.path}>
            <button
              type="button"
              className="working-tree-row"
              onClick={() => {
                if (entry.kind !== 'directory') {
                  onOpenFile(entry.path);
                  return;
                }
                if (!open && !loadedDirectoryPathsRef.current.has(entry.path)) void loadDirectory(entry.path);
                onExpandedPathsChange((current) => {
                  const next = new Set(current);
                  open ? next.delete(entry.path) : next.add(entry.path);
                  return next;
                });
              }}
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
              {loading && <span className="working-tree-row__loading">…</span>}
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
          {context.entry.kind === 'directory' && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                const folder = context.entry.path;
                setContext(null);
                createEntry(folder, 'file');
              }}
            >
              <FilePlus size={14} />
              <span>Add file</span>
            </button>
          )}
          {context.entry.kind === 'directory' && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                const folder = context.entry.path;
                setContext(null);
                createEntry(folder, 'folder');
              }}
            >
              <FolderPlus size={14} />
              <span>Add folder</span>
            </button>
          )}
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
          {context.entry.path && context.entry.kind === 'file' && (
            <button
              type="button"
              className="working-tree-context-menu__item"
              onClick={() => {
                setFileInfoPath(context.entry.path);
                setContext(null);
              }}
            >
              <Info size={14} />
              <span>File information</span>
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
                  void pasteInto(targetFolder);
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
      {repoPath && fileInfoPath && <WorkingDirectoryFileInfoDialog repoPath={repoPath} path={fileInfoPath} onClose={() => setFileInfoPath(null)} />}
    </div>
  );
};
