import React from 'react';
import { Archive, CaseLower, Copy, FileCog, FolderInput, FolderSearch, ListTree, Pencil, RotateCcw, ShieldPlus } from 'lucide-react';
import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';
import type { WorkingDirectoryToolActions } from './workingDirectoryToolActions';

type Props = {
  entries: WorkingDirectoryEntryDto[];
  actions: WorkingDirectoryToolActions;
  onClose: () => void;
};

export const WorkingDirectoryToolsMenu: React.FC<Props> = ({ entries, actions, onClose }) => {
  const hasRoot = entries.some((entry) => !entry.path);
  const allFiles = entries.every((entry) => entry.kind === 'file');
  const hasDirectory = entries.some((entry) => entry.kind === 'directory');
  const labelSuffix = entries.length === 1 ? '' : 's';
  const run = (action: (selected: WorkingDirectoryEntryDto[]) => void) => {
    onClose();
    action(entries);
  };

  return (
    <>
      <div className="working-tree-context-menu__separator" />
      {!hasRoot && (
        <>
          <button type="button" className="working-tree-context-menu__item" onClick={() => run((selected) => void actions.moveTo(selected))}>
            <FolderInput size={14} />
            <span>Move to...</span>
          </button>
          <button type="button" className="working-tree-context-menu__item" onClick={() => run((selected) => void actions.copyPaths(selected, false))}>
            <Copy size={14} />
            <span>Copy relative path{labelSuffix}</span>
          </button>
          <button type="button" className="working-tree-context-menu__item" onClick={() => run((selected) => void actions.copyPaths(selected, true))}>
            <Copy size={14} />
            <span>Copy absolute path{labelSuffix}</span>
          </button>
          <button type="button" className="working-tree-context-menu__item" onClick={() => run(actions.addAffixes)}>
            <Pencil size={14} />
            <span>Add prefix / suffix</span>
          </button>
          <button type="button" className="working-tree-context-menu__item" onClick={() => run(actions.removeAffixes)}>
            <RotateCcw size={14} />
            <span>Remove prefix / suffix</span>
          </button>
          {allFiles && (
            <button type="button" className="working-tree-context-menu__item" onClick={() => run(actions.changeExtension)}>
              <FileCog size={14} />
              <span>Change file extension</span>
            </button>
          )}
          <button type="button" className="working-tree-context-menu__item" onClick={() => run(actions.normalizeNames)}>
            <CaseLower size={14} />
            <span>Normalize name{labelSuffix}</span>
          </button>
        </>
      )}
      <button type="button" className="working-tree-context-menu__item" onClick={() => run((selected) => void actions.sortFilesByType(selected))}>
        <ListTree size={14} />
        <span>Sort files by type</span>
      </button>
      {hasDirectory && (
        <button type="button" className="working-tree-context-menu__item" onClick={() => run((selected) => void actions.cleanEmptyFolders(selected))}>
          <FolderSearch size={14} />
          <span>Clean empty folders</span>
        </button>
      )}
      {!hasRoot && (
        <>
          <button type="button" className="working-tree-context-menu__item" onClick={() => run(actions.addToGitignore)}>
            <ShieldPlus size={14} />
            <span>Add to .gitignore</span>
          </button>
          <button type="button" className="working-tree-context-menu__item" onClick={() => run(actions.createArchive)}>
            <Archive size={14} />
            <span>Create ZIP archive</span>
          </button>
        </>
      )}
    </>
  );
};
