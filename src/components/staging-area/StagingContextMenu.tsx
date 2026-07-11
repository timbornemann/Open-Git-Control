import { useI18n } from '@/i18n';
import type { FileSection, StagingContextMenuState } from './types';
import type { useFileOperations } from './useFileOperations';
import { dirname, extensionPattern, toGitPath } from './utils';
import { escapeGitignoreLiteralPath } from './gitignorePattern';

type StagingContextMenuProps = {
  contextMenu: StagingContextMenuState | null;
  fileOps: ReturnType<typeof useFileOperations>;
};

export const StagingContextMenu: React.FC<StagingContextMenuProps> = ({ contextMenu, fileOps }) => {
  const { t, tr } = useI18n();

  if (!contextMenu) return null;

  const contextEntry = contextMenu.entry;
  const contextSection: FileSection = contextMenu.section;
  const contextDir = dirname(contextEntry.path);
  const contextTopDir = contextDir.includes('/') ? contextDir.split('/')[0] : '';
  const contextExtPattern = extensionPattern(contextEntry.path);
  const closeContextMenu = () => fileOps.setContextMenu(null);

  return (
    <div className="ctx-menu-backdrop" onClick={closeContextMenu}>
      <div className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
        <div className="ctx-menu-header">{contextEntry.path}</div>
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
