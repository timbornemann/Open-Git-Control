import { useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { FileSection, StagingContextMenuState } from './types';
import type { useFileOperations } from './useFileOperations';
import { dirname, extensionPattern, toGitPath } from './utils';
import { escapeGitignoreLiteralPath } from './gitignorePattern';

type StagingContextMenuProps = {
  contextMenu: StagingContextMenuState | null;
  fileOps: ReturnType<typeof useFileOperations>;
};

const CTX_MENU_WIDTH = 220;
const CTX_MENU_HEIGHT = 260;
const CTX_MENU_MARGIN = 8;

export const StagingContextMenu: React.FC<StagingContextMenuProps> = ({ contextMenu, fileOps }) => {
  const { t, tr } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!contextMenu) return;
    // A file near the bottom or right edge of the window must not anchor the
    // menu at the raw click point: the number of items varies (ignore rules,
    // stash actions, ...), so an unclamped position can push part of the menu
    // past the viewport where it is visually cut off.
    const width = menuRef.current?.offsetWidth || CTX_MENU_WIDTH;
    const height = menuRef.current?.offsetHeight || CTX_MENU_HEIGHT;
    setPlacement({
      left: Math.max(CTX_MENU_MARGIN, Math.min(contextMenu.x, window.innerWidth - width - CTX_MENU_MARGIN)),
      top: Math.max(CTX_MENU_MARGIN, Math.min(contextMenu.y, window.innerHeight - height - CTX_MENU_MARGIN)),
    });
  }, [contextMenu]);

  if (!contextMenu) return null;

  const contextEntry = contextMenu.entry;
  const contextSection: FileSection = contextMenu.section;
  const contextDir = dirname(contextEntry.path);
  const contextTopDir = contextDir.includes('/') ? contextDir.split('/')[0] : '';
  const contextExtPattern = extensionPattern(contextEntry.path);
  const closeContextMenu = () => fileOps.setContextMenu(null);

  return (
    <div className="ctx-menu-backdrop" onClick={closeContextMenu}>
      <div ref={menuRef} className="ctx-menu" style={{ left: placement.left, top: placement.top }} onClick={(event) => event.stopPropagation()}>
        <div className="ctx-menu-header">{contextEntry.path}</div>
        <button
          className="ctx-menu-item"
          disabled={fileOps.isMutating}
          onClick={() => {
            closeContextMenu();
            void fileOps.openRepositoryPath(contextEntry.path, 'reveal');
          }}
        >
          <span className="ctx-menu-icon">FM</span>
          {tr('Im Dateimanager anzeigen', 'Show in file manager')}
        </button>
        <button
          className="ctx-menu-item"
          disabled={fileOps.isMutating}
          onClick={() => {
            closeContextMenu();
            void fileOps.openRepositoryPath(contextEntry.path, 'open');
          }}
        >
          <span className="ctx-menu-icon">OP</span>
          {tr('Datei oeffnen', 'Open file')}
        </button>
        <button
          className="ctx-menu-item"
          disabled={fileOps.isMutating}
          onClick={() => {
            closeContextMenu();
            void fileOps.openRepositoryPath(contextEntry.path, 'openWith');
          }}
        >
          <span className="ctx-menu-icon">OW</span>
          {tr('Oeffnen mit...', 'Open with...')}
        </button>
        <div className="ctx-menu-sep" />
        <button
          className="ctx-menu-item"
          disabled={fileOps.isMutating}
          onClick={() => {
            closeContextMenu();
            fileOps.stashFile(contextEntry.path, contextSection);
          }}
        >
          <span className="ctx-menu-icon">ST</span>
          {t('generated.components.staging_area.stagingcontextmenu.stash_file_4af4bc1d')}
        </button>
        <button
          className="ctx-menu-item"
          disabled={fileOps.isMutating}
          onClick={() => {
            closeContextMenu();
            fileOps.stashAll();
          }}
        >
          <span className="ctx-menu-icon">ALL</span>
          {t('generated.components.staging_area.stagingcontextmenu.stash_all_changes_e6f3a2ed')}
        </button>
        <div className="ctx-menu-sep" />
        <button
          className="ctx-menu-item"
          onClick={() => {
            closeContextMenu();
            fileOps.addIgnoreRule(contextEntry, contextSection, escapeGitignoreLiteralPath(toGitPath(contextEntry.path)));
          }}
        >
          <span className="ctx-menu-icon">IG</span>
          {t('generated.components.staging_area.stagingcontextmenu.add_file_to_gitignore_45f071fe')}
        </button>
        {contextDir && (
          <button
            className="ctx-menu-item"
            onClick={() => {
              closeContextMenu();
              fileOps.addIgnoreRule(contextEntry, contextSection, `${escapeGitignoreLiteralPath(contextDir)}/`);
            }}
          >
            <span className="ctx-menu-icon">DIR</span>
            {tr(`Ordner ignorieren (${contextDir}/)`, `Ignore folder (${contextDir}/)`)}
          </button>
        )}
        {contextTopDir && contextTopDir !== contextDir && (
          <button
            className="ctx-menu-item"
            onClick={() => {
              closeContextMenu();
              fileOps.addIgnoreRule(contextEntry, contextSection, `${escapeGitignoreLiteralPath(contextTopDir)}/`);
            }}
          >
            <span className="ctx-menu-icon">TOP</span>
            {tr(`Oberordner ignorieren (${contextTopDir}/)`, `Ignore top-level folder (${contextTopDir}/)`)}
          </button>
        )}
        {contextExtPattern && (
          <button
            className="ctx-menu-item"
            onClick={() => {
              closeContextMenu();
              fileOps.addIgnoreRule(contextEntry, contextSection, contextExtPattern);
            }}
          >
            <span className="ctx-menu-icon">EXT</span>
            {tr(`Dateityp ignorieren (${contextExtPattern})`, `Ignore file type (${contextExtPattern})`)}
          </button>
        )}
      </div>
    </div>
  );
};
