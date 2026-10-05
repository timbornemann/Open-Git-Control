import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Image } from 'lucide-react';
import { useI18n } from '@/i18n';
import { openRepositoryIconDialog } from './repositoryIconDialogEvents';

type MenuState = { repoPath: string; x: number; y: number };
export function useRepositoryIconMenu() {
  const [state, setState] = useState<MenuState | null>(null);
  const open = (event: MouseEvent<HTMLElement>, repoPath: string) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ repoPath, x: event.clientX, y: event.clientY });
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>, repoPath: string) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setState({ repoPath, x: rect.right, y: rect.bottom });
  };
  return { open, keyboard, menu: state ? <RepositoryIconMenu state={state} onClose={() => setState(null)} /> : null };
}
function RepositoryIconMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const { tr } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    setPosition({
      left: Math.max(8, Math.min(state.x, window.innerWidth - menu.offsetWidth - 8)),
      top: Math.max(8, Math.min(state.y, window.innerHeight - menu.offsetHeight - 8)),
    });
    menu.querySelector('button')?.focus();
  }, [state]);
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div
      className="repo-list-context-backdrop"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div ref={ref} role="menu" className="repo-list-context-menu repository-icon-menu" style={position} onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          role="menuitem"
          className="repo-list-context-action"
          onClick={() => {
            onClose();
            openRepositoryIconDialog(state.repoPath);
          }}
        >
          <Image size={14} /> {tr('Repository-Logo …', 'Repository logo …')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
