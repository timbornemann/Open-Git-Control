import { useLayoutEffect, useRef, type RefObject } from 'react';
import { ClipboardPaste, Copy, ExternalLink, File, FilePlus, FolderOpen, FolderPlus, Info, Pencil, Scissors, Trash2, type LucideIcon } from 'lucide-react';
import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';
import type { WorkingDirectoryToolActions } from './workingDirectoryToolActions';
import { WorkingDirectoryToolsMenu } from './WorkingDirectoryToolsMenu';

type Entry = WorkingDirectoryEntryDto;
type Props = {
  context: { entry: Entry; entries: Entry[] };
  placement: { left: number; top: number };
  menuRef: RefObject<HTMLDivElement>;
  rootLabel: string;
  canPaste: boolean;
  actions: WorkingDirectoryToolActions;
  onClose: () => void;
  onCreate: (folder: string, kind: 'file' | 'folder') => void;
  onOpen: (path: string) => void;
  onInfo: (path: string) => void;
  onRename: (entry: Entry) => void;
  onCopy: (entry: Entry, cut: boolean) => void;
  onPaste: () => void;
  onDelete: (entries: Entry[]) => void;
  onExternal: (path: string, action: 'reveal' | 'open' | 'openWith') => void;
};
function Item({ id, label, icon: Icon, onClick, danger = false }: { id: string; label: string; icon: LucideIcon; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-tree-action={id}
      className={`working-tree-context-menu__item${danger ? ' working-tree-context-menu__item--danger' : ''}`}
      onClick={onClick}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
export function WorkingDirectoryContextMenu({
  context,
  placement,
  menuRef,
  rootLabel,
  canPaste,
  actions,
  onClose,
  onCreate,
  onOpen,
  onInfo,
  onRename,
  onCopy,
  onPaste,
  onDelete,
  onExternal,
}: Props) {
  const previousFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [menuRef]);
  const { entry, entries } = context;
  const run = (action: () => void) => {
    onClose();
    action();
  };
  const tools = <WorkingDirectoryToolsMenu entries={entries} actions={actions} onClose={onClose} />;
  const separator = <div className="working-tree-context-menu__separator" />;
  return (
    <div
      ref={menuRef}
      className="working-tree-context-menu"
      style={{ position: 'fixed', left: placement.left, top: placement.top, zIndex: 50 }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          previousFocus.current?.focus({ preventScroll: true });
          return;
        }
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const index =
          event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        event.preventDefault();
        event.stopPropagation();
        items[index]?.focus();
      }}
      role="menu"
      aria-label="File actions"
    >
      <div className="working-tree-context-menu__header">{entries.length > 1 ? `${entries.length} items selected` : entry.path || rootLabel}</div>
      {entries.length > 1 ? (
        <>
          {tools}
          {separator}
          <Item id="delete-selected" label="Delete selected" icon={Trash2} danger onClick={() => run(() => onDelete(entries))} />
        </>
      ) : (
        <>
          {entry.kind === 'directory' && (
            <>
              <Item id="create-file" label="Add file" icon={FilePlus} onClick={() => run(() => onCreate(entry.path, 'file'))} />
              <Item id="create-folder" label="Add folder" icon={FolderPlus} onClick={() => run(() => onCreate(entry.path, 'folder'))} />
            </>
          )}
          {entry.path && entry.kind === 'file' && (
            <>
              <Item id="open" label="Open" icon={File} onClick={() => run(() => onOpen(entry.path))} />
              <Item id="info" label="File information" icon={Info} onClick={() => run(() => onInfo(entry.path))} />
            </>
          )}
          {entry.path && (
            <>
              <Item id="rename" label="Rename" icon={Pencil} onClick={() => run(() => onRename(entry))} />
              <Item id="copy" label="Copy" icon={Copy} onClick={() => run(() => onCopy(entry, false))} />
              <Item id="cut" label="Cut" icon={Scissors} onClick={() => run(() => onCopy(entry, true))} />
            </>
          )}
          {canPaste && (
            <>
              {separator}
              <Item id="paste" label="Paste" icon={ClipboardPaste} onClick={() => run(onPaste)} />
            </>
          )}
          {tools}
          {entry.path && (
            <>
              {separator}
              <Item id="reveal" label="Show in file system" icon={FolderOpen} onClick={() => run(() => onExternal(entry.path, 'reveal'))} />
              <Item id="open-external" label="Open externally" icon={ExternalLink} onClick={() => run(() => onExternal(entry.path, 'open'))} />
              <Item id="open-with" label="Open with" icon={ExternalLink} onClick={() => run(() => onExternal(entry.path, 'openWith'))} />
              {separator}
              <Item id="delete" label="Delete" icon={Trash2} danger onClick={() => run(() => onDelete([entry]))} />
            </>
          )}
        </>
      )}
    </div>
  );
}
