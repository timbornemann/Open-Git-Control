import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { useI18n } from '@/i18n';
import './sidebarActionsMenu.css';

type Action = { id: string; label: string; icon: ReactNode; disabled?: boolean; run: () => void };

export function SidebarActionsMenu({ actions }: { actions: Action[] }) {
  const { tr } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const keyboard = useRef(false);
  const keepOpen = () => {
    clearTimeout(closeTimer.current);
  };
  const close = (focus = false) => {
    keepOpen();
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  const leave = () => {
    keepOpen();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - (menu.current?.offsetHeight || 60) - 8)),
          left: Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248)),
        });
    };
    place();
    if (keyboard.current) {
      menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      keyboard.current = false;
    }
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-btn sidebar-row-action-icon"
        aria-label={tr('Branch-Aktionen', 'Branch actions')}
        title={tr('Branch-Aktionen', 'Branch actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onMouseEnter={() => {
          keepOpen();
          setOpen(true);
        }}
        onMouseLeave={leave}
        onClick={() => {
          keepOpen();
          setOpen(true);
        }}
        onBlur={(event) => {
          if (!menu.current?.contains(event.relatedTarget as Node)) leave();
        }}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            keyboard.current = true;
            keepOpen();
            setOpen(true);
            if (open) {
              menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
              keyboard.current = false;
            }
          }
        }}
      >
        <MoreHorizontal size={13} />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={menu}
            role="menu"
            aria-label={tr('Branch-Aktionen', 'Branch actions')}
            className="sidebar-actions-menu"
            style={position}
            onMouseEnter={keepOpen}
            onMouseLeave={leave}
            onBlur={(event) => {
              if (!menu.current?.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) leave();
            }}
            onKeyDown={(event) => {
              const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && items.length) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
                items[next].focus();
              }
            }}
          >
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  close(true);
                  action.run();
                }}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
