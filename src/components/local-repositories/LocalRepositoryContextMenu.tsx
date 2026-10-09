import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, BarChart3, Copy, FolderGit2, FolderOpen, Image, Pin, PinOff, Settings2, X } from 'lucide-react';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { copyTextToClipboard } from '@/utils/clipboard';
import { knownHttpRemote, repoName } from './localRepositorySelectors';
import { openRepositoryIconDialog } from '@/components/repository-icon/repositoryIconDialogEvents';

export type LocalRepositoryMenuState = { x: number; y: number; path: string };

type Props = {
  menu: LocalRepositoryMenuState;
  origin: string | null;
  pinned: boolean;
  onClose: () => void;
  onOpenRepoTab: (path: string) => void;
  onOpenRepositoryAnalytics?: (path: string) => void;
  onOpenRunConfig: (path: string) => void;
  onOpenSecretScanAllowlist?: (path: string) => void;
  onOpenRemoteConfig: (path: string) => void;
  onPublishRepository?: (path: string) => void;
  onTogglePin: (path: string) => void;
  onRemove: (path: string) => void;
};

const MENU_MARGIN = 8;

export const LocalRepositoryContextMenu: React.FC<Props> = ({
  menu,
  origin,
  pinned,
  onClose,
  onOpenRepoTab,
  onOpenRepositoryAnalytics,
  onOpenRunConfig,
  onOpenSecretScanAllowlist,
  onOpenRemoteConfig,
  onPublishRepository,
  onTogglePin,
  onRemove,
}) => {
  const { tr } = useI18n();
  const showToast = useAppToast();
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
  const remoteUrl = knownHttpRemote(origin);

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    setPlacement({
      left: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - element.offsetWidth - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(menu.y, window.innerHeight - element.offsetHeight - MENU_MARGIN)),
    });
    element.querySelector<HTMLButtonElement>('button')?.focus();
  }, [menu, remoteUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  const openFolder = async () => {
    try {
      const result = await gitClient.openRepositoryPath({ action: 'open', repoPath: menu.path });
      if (!result.success) throw new Error(result.error || tr('Der Ordner konnte nicht geöffnet werden.', 'Could not open the folder.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('Der Ordner konnte nicht geöffnet werden.', 'Could not open the folder.'), true);
    }
  };

  const copyPath = async () => {
    const copied = await copyTextToClipboard(menu.path);
    showToast(copied ? tr('Pfad kopiert.', 'Path copied.') : tr('Pfad konnte nicht kopiert werden.', 'Could not copy the path.'), !copied);
  };

  const openRemote = async () => {
    if (!remoteUrl) return;
    try {
      const result = await appClient.openExternalUrl(remoteUrl);
      if (!result.success) throw new Error(result.error || tr('Remote konnte nicht geöffnet werden.', 'Could not open the remote.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('Remote konnte nicht geöffnet werden.', 'Could not open the remote.'), true);
    }
  };

  return createPortal(
    <div
      className="repo-list-context-backdrop"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="repo-list-context-menu local-repository-context-menu"
        role="menu"
        aria-label={tr(`Aktionen für ${repoName(menu.path)}`, `Actions for ${repoName(menu.path)}`)}
        style={{ left: placement?.left ?? menu.x, top: placement?.top ?? menu.y, visibility: placement ? 'visible' : 'hidden' }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="repo-list-context-header" title={menu.path}>
          {repoName(menu.path)}
        </div>
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => onOpenRepoTab(menu.path))}>
          <FolderGit2 size={14} /> {tr('Repo-Tab öffnen', 'Open repository tab')}
        </button>
        {onOpenRepositoryAnalytics && (
          <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => onOpenRepositoryAnalytics(menu.path))}>
            <BarChart3 size={14} /> {tr('Statistik & Analyse', 'Statistics & analytics')}
          </button>
        )}
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => onOpenRunConfig(menu.path))}>
          <Settings2 size={14} /> {tr('Run-Konfiguration', 'Run configuration')}
        </button>
        <button
          type="button"
          role="menuitem"
          className="repo-list-context-action"
          onClick={() => run(() => onOpenSecretScanAllowlist?.(menu.path))}
          disabled={!onOpenSecretScanAllowlist}
        >
          <Settings2 size={14} /> {tr('Secret-Scan-Allowlist', 'Secret-scan allowlist')}
        </button>
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => onOpenRemoteConfig(menu.path))}>
          <Settings2 size={14} /> {tr('Remote-Konfiguration', 'Remote configuration')}
        </button>
        {onPublishRepository && (
          <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => onPublishRepository(menu.path))}>
            <ArrowUpRight size={14} /> {tr('Repository veröffentlichen', 'Publish repository')}
          </button>
        )}
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => void openFolder())}>
          <FolderOpen size={14} /> {tr('Im Dateimanager öffnen', 'Open in file manager')}
        </button>
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => void copyPath())}>
          <Copy size={14} /> {tr('Pfad kopieren', 'Copy path')}
        </button>
        {remoteUrl && (
          <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => void openRemote())}>
            <ArrowUpRight size={14} /> {tr('Remote im Browser öffnen', 'Open remote in browser')}
          </button>
        )}
        <div className="repo-list-context-separator" role="separator" />
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => openRepositoryIconDialog(menu.path))}>
          <Image size={14} /> {tr('Repository-Logo …', 'Repository logo …')}
        </button>
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => run(() => onTogglePin(menu.path))}>
          {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          {pinned ? tr('Pin entfernen', 'Remove pin') : tr('Repo anheften', 'Pin repository')}
        </button>
        <button type="button" role="menuitem" className="repo-list-context-action danger" onClick={() => run(() => onRemove(menu.path))}>
          <X size={14} /> {tr('Aus Liste entfernen', 'Remove from list')}
        </button>
      </div>
    </div>,
    document.body,
  );
};
