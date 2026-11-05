import { useEffect, useRef } from 'react';

const controls =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), details > summary, [tabindex]:not([tabindex="-1"])';
const visible = (element: HTMLElement) =>
  !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== 'hidden' &&
  getComputedStyle(element).display !== 'none';

/** Practice dialogs share their focus boundary with the explanation and exit. */
export function useTutorialFocusNavigation(enabled: boolean) {
  const surfaces = useRef(new Set<HTMLElement>());
  useEffect(() => {
    if (!enabled) return;
    const modalValues = new Map<HTMLElement, string>();
    const activeSurface = () => {
      const shown = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"]')].filter(visible);
      for (const surface of surfaces.current) if (!shown.includes(surface)) surfaces.current.delete(surface);
      // Portals may be inserted before an older dialog in document order.
      // Preserve opening order so Tab belongs to the most recently opened one.
      for (const surface of shown) surfaces.current.add(surface);
      return [...surfaces.current].at(-1);
    };
    const includeCoach = () => {
      activeSurface();
      for (const dialog of document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')) {
        if (dialog.matches('.tutorial-chapter-chooser')) continue;
        modalValues.set(dialog, 'true');
        dialog.setAttribute('aria-modal', 'false');
      }
      for (const dialog of modalValues.keys()) if (!dialog.isConnected) modalValues.delete(dialog);
    };
    const handle = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const surface = activeSurface();
      if (!surface || surface.matches('.tutorial-chapter-chooser')) return;
      const regions = [surface, ...document.querySelectorAll<HTMLElement>('.tutorial-banner, .tutorial-coach')];
      const focusable = [
        ...new Set(
          regions.flatMap((region) =>
            [...region.querySelectorAll<HTMLElement>(controls)].sort((left, right) =>
              left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
            ),
          ),
        ),
      ].filter(visible);
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      event.stopPropagation();
      focusable[next].focus();
    };
    const observer = new MutationObserver(includeCoach);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden', 'class', 'style'] });
    document.addEventListener('keydown', handle, true);
    includeCoach();
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', handle, true);
      for (const [dialog, value] of modalValues) if (dialog.isConnected) dialog.setAttribute('aria-modal', value);
    };
  }, [enabled]);
}
