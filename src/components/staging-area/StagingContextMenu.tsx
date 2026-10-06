import { useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { FileSection, StagingContextMenuState } from './types';
import type { useFileOperations } from './useFileOperations';
import { dirname, extensionPattern, toGitPath } from './utils';
import { escapeGitignoreLiteralPath } from './gitignorePattern';
import { appClient } from '@/services/appClient';

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
    const place = () => {
      const width = menuRef.current?.offsetWidth || CTX_MENU_WIDTH;
      const height = menuRef.current?.offsetHeight || CTX_MENU_HEIGHT;
      setPlacement({
        left: Math.max(CTX_MENU_MARGIN, Math.min(contextMenu.x, window.innerWidth - width - CTX_MENU_MARGIN)),
        top: Math.max(CTX_MENU_MARGIN, Math.min(contextMenu.y, window.innerHeight - height - CTX_MENU_MARGIN)),
      });
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (menuRef.current) observer?.observe(menuRef.current);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [contextMenu, fileOps.lfs?.loading]);

  if (!contextMenu) return null;

  const contextEntry = contextMenu.entry;
  const contextSection: FileSection = contextMenu.section;
  const contextDir = dirname(contextEntry.path);
  const contextTopDir = contextDir.includes('/') ? contextDir.split('/')[0] : '';
  const contextExtPattern = extensionPattern(contextEntry.path);
  const lfs = fileOps.lfs;
  const lfsState = lfs?.stateFor(contextEntry.path, contextSection);
  const closeContextMenu = () => fileOps.setContextMenu(null);

  return (
    <div className="ctx-menu-backdrop" onClick={closeContextMenu}>
      <div
        ref={menuRef}
        className="ctx-menu staging-context-menu"
        role="menu"
        aria-label={contextEntry.path}
        style={{ left: placement.left, top: placement.top }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            closeContextMenu();
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
            items[next]?.focus();
          }
        }}
      >
        <div className="ctx-menu-header">{contextEntry.path}</div>
        {lfs && (
          <>
            <button
              className="ctx-menu-item"
              disabled={fileOps.isMutating || !lfs.available || !lfsState?.eligible || (lfsState.configured && lfsState.pointer)}
              title={lfsState?.reason || lfs.error}
              onClick={() => {
                closeContextMenu();
                void lfs.track(contextEntry, contextSection, 'file');
              }}
            >
              <span className="ctx-menu-icon">LFS</span>
              {lfs.loading
                ? tr('Git LFS wird geprüft…', 'Checking Git LFS…')
                : lfsState?.needsRestage
                  ? tr('Für Git LFS erneut stagen', 'Restage for Git LFS')
                  : lfsState?.configured && lfsState.pointer
                    ? tr('Git LFS bereits eingerichtet', 'Git LFS already configured')
                    : tr('Mit Git LFS speichern und stagen', 'Store and stage with Git LFS')}
            </button>
            {lfsState?.extension && (
              <button
                className="ctx-menu-item"
                disabled={fileOps.isMutating || !lfs.available || !lfsState.eligible}
                onClick={() => {
                  closeContextMenu();
                  fileOps.trackFileTypeWithLfs(contextEntry, contextSection);
                }}
              >
                <span className="ctx-menu-icon">LFS</span>
                {tr(`Dateityp mit Git LFS verwalten (*${lfsState.extension})`, `Manage file type with Git LFS (*${lfsState.extension})`)}
              </button>
            )}
            {lfs.error && <div className="ctx-menu-header">{lfs.error}</div>}
            {!lfs.loading && !lfs.available && (
              <button
                className="ctx-menu-item"
                onClick={() => {
                  closeContextMenu();
                  void appClient.openExternalUrl('https://git-lfs.com/');
                }}
              >
                {tr('Git LFS installieren…', 'Install Git LFS…')}
              </button>
            )}
            <div className="ctx-menu-sep" />
          </>
        )}
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
