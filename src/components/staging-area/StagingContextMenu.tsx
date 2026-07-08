import { useI18n } from '../../i18n';
import type { FileSection, StagingContextMenuState } from './types';
import type { useFileOperations } from './useFileOperations';
import {
  dirname,
  extensionPattern,
  toGitPath,
} from './utils';

type StagingContextMenuProps = {
  contextMenu: StagingContextMenuState | null;
  fileOps: ReturnType<typeof useFileOperations>;
};

export const StagingContextMenu: React.FC<StagingContextMenuProps> = ({
  contextMenu,
  fileOps,
}) => {
  const { tr } = useI18n();

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
        <button className="ctx-menu-item" disabled={fileOps.isMutating} onClick={() => { closeContextMenu(); fileOps.stashFile(contextEntry.path, contextSection); }}>
          <span className="ctx-menu-icon">ST</span>
          {tr('Datei stashen...', 'Stash file...')}
        </button>
        <button className="ctx-menu-item" disabled={fileOps.isMutating} onClick={() => { closeContextMenu(); fileOps.stashAll(); }}>
          <span className="ctx-menu-icon">ALL</span>
          {tr('Alle Aenderungen stashen...', 'Stash all changes...')}
        </button>
        <div className="ctx-menu-sep" />
        <button className="ctx-menu-item" onClick={() => { closeContextMenu(); fileOps.addIgnoreRule(contextEntry, contextSection, toGitPath(contextEntry.path)); }}>
          <span className="ctx-menu-icon">IG</span>
          {tr('Datei zu .gitignore hinzufuegen', 'Add file to .gitignore')}
        </button>
        {contextDir && (
          <button className="ctx-menu-item" onClick={() => { closeContextMenu(); fileOps.addIgnoreRule(contextEntry, contextSection, `${contextDir}/`); }}>
            <span className="ctx-menu-icon">DIR</span>
            {tr(`Ordner ignorieren (${contextDir}/)`, `Ignore folder (${contextDir}/)`)}
          </button>
        )}
        {contextTopDir && contextTopDir !== contextDir && (
          <button className="ctx-menu-item" onClick={() => { closeContextMenu(); fileOps.addIgnoreRule(contextEntry, contextSection, `${contextTopDir}/`); }}>
            <span className="ctx-menu-icon">TOP</span>
            {tr(`Oberordner ignorieren (${contextTopDir}/)`, `Ignore top-level folder (${contextTopDir}/)`)}
          </button>
        )}
        {contextExtPattern && (
          <button className="ctx-menu-item" onClick={() => { closeContextMenu(); fileOps.addIgnoreRule(contextEntry, contextSection, contextExtPattern); }}>
            <span className="ctx-menu-icon">EXT</span>
            {tr(`Dateityp ignorieren (${contextExtPattern})`, `Ignore file type (${contextExtPattern})`)}
          </button>
        )}
      </div>
    </div>
  );
};
