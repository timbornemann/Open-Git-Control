import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Copy, Download, FolderGit2, FolderOpen, Info, Star } from 'lucide-react';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import type { GitHubRepositoryDto } from '@/types/githubDtos';
import { copyTextToClipboard } from '@/utils/clipboard';

export type GithubRepoContextMenuState = { x: number; y: number; repo: GitHubRepositoryDto };

type Props = {
  menu: GithubRepoContextMenuState;
  localPaths: string[];
  online: boolean;
  pinned: boolean;
  onClose: () => void;
  onOpenDetails: (repo: GitHubRepositoryDto) => void;
  onOpenLocalTab: (path: string) => void;
  onClone: (repo: GitHubRepositoryDto) => void;
  onTogglePin: (repo: GitHubRepositoryDto) => void;
};

const MENU_MARGIN = 8;

export const GithubRepoContextMenu: React.FC<Props> = ({ menu, localPaths, online, pinned, onClose, onOpenDetails, onOpenLocalTab, onClone, onTogglePin }) => {
  const { tr } = useI18n();
  const showToast = useAppToast();
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
  const { repo } = menu;

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    setPlacement({
      left: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(menu.y, window.innerHeight - height - MENU_MARGIN)),
    });
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu, localPaths.length, online]);

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

  const runAction = (action: () => void) => {
    onClose();
    action();
  };

  const openFolder = async (path: string) => {
    try {
      const result = await gitClient.openRepositoryPath({ action: 'open', repoPath: path });
      if (!result.success) throw new Error(result.error || tr('Der Ordner konnte nicht geöffnet werden.', 'Could not open the folder.'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : tr('Der Ordner konnte nicht geöffnet werden.', 'Could not open the folder.'), true);
    }
  };

  const copyUrl = async () => {
    const copied = await copyTextToClipboard(repo.htmlUrl);
    showToast(
      copied ? tr('GitHub-URL kopiert.', 'GitHub URL copied.') : tr('Die GitHub-URL konnte nicht kopiert werden.', 'Could not copy the GitHub URL.'),
      !copied,
    );
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
        className="repo-list-context-menu github-repo-context-menu"
        role="menu"
        aria-label={tr(`Aktionen für ${repo.fullName}`, `Actions for ${repo.fullName}`)}
        style={{ left: placement?.left ?? menu.x, top: placement?.top ?? menu.y, visibility: placement ? 'visible' : 'hidden' }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="repo-list-context-header" title={repo.fullName}>
          {repo.fullName}
        </div>
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => runAction(() => onOpenDetails(repo))}>
          <Info size={14} /> {tr('Repository-Details öffnen', 'Open repository details')}
        </button>
        {localPaths.map((path) => {
          const suffix = localPaths.length > 1 ? ` · ${path.split(/[\\/]/).filter(Boolean).slice(-2).join('/')}` : '';
          return (
            <React.Fragment key={path}>
              <button type="button" role="menuitem" className="repo-list-context-action" title={path} onClick={() => runAction(() => onOpenLocalTab(path))}>
                <FolderGit2 size={14} />{' '}
                <span>
                  {tr('Repo-Tab öffnen', 'Open repository tab')}
                  {suffix}
                </span>
              </button>
              <button type="button" role="menuitem" className="repo-list-context-action" title={path} onClick={() => runAction(() => void openFolder(path))}>
                <FolderOpen size={14} />{' '}
                <span>
                  {tr('Im Dateimanager öffnen', 'Open in file manager')}
                  {suffix}
                </span>
              </button>
            </React.Fragment>
          );
        })}
        <div className="repo-list-context-separator" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="repo-list-context-action"
          onClick={() => runAction(() => void githubClient.openExternalUrl(repo.htmlUrl))}
        >
          <ArrowUpRight size={14} /> {tr('Auf GitHub öffnen', 'Open on GitHub')}
        </button>
        <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => runAction(() => void copyUrl())}>
          <Copy size={14} /> {tr('GitHub-URL kopieren', 'Copy GitHub URL')}
        </button>
        <div className="repo-list-context-separator" role="separator" />
        <button type="button" role="menuitem" className="repo-list-context-action" disabled={!online} onClick={() => runAction(() => onTogglePin(repo))}>
          <Star size={14} fill={pinned ? 'currentColor' : 'none'} />
          {pinned ? tr('Pin entfernen', 'Remove pin') : tr('Repo anheften', 'Pin repository')}
        </button>
        {online && !localPaths.length && (
          <button type="button" role="menuitem" className="repo-list-context-action" onClick={() => runAction(() => onClone(repo))}>
            <Download size={14} /> {tr('Repository klonen', 'Clone repository')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};
