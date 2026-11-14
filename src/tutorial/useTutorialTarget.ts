import { useEffect, useState } from 'react';

const sameBox = (first: DOMRect | null, second: DOMRect | null) =>
  first === second ||
  Boolean(first && second && first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height);
const visible = (element: HTMLElement) => element.getClientRects().length > 0;

export function useTutorialTarget(target: string, prepared = true) {
  const [bounds, setBounds] = useState<{ rect: DOMRect | null; workspace: DOMRect | null }>({ rect: null, workspace: null });
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let hiddenUpdate: ReturnType<typeof setTimeout> | undefined;
    let element: HTMLElement | null = null;
    let scrollArea: HTMLElement | null = null;
    let previousDescription: string | null = null;
    let revealAfterResize = false;
    const workspace = document.querySelector<HTMLElement>('.tutorial-workspace');
    const restoreDescription = () => {
      if (element) previousDescription === null ? element.removeAttribute('aria-describedby') : element.setAttribute('aria-describedby', previousDescription);
    };
    const schedule = () => {
      if (frame || hiddenUpdate !== undefined) return;
      // Chromium can suspend animation frames in a covered WebContentsView.
      // Geometry still needs to settle before the view becomes visible again.
      if (document.visibilityState === 'hidden') hiddenUpdate = setTimeout(update, 0);
      else frame = requestAnimationFrame(update);
    };
    const visibilityChanged = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(hiddenUpdate);
      hiddenUpdate = undefined;
      schedule();
    };
    const resized = () => {
      revealAfterResize = true;
      schedule();
    };
    const resize = new ResizeObserver(resized);
    if (workspace) resize.observe(workspace);
    function update() {
      frame = 0;
      hiddenUpdate = undefined;
      // Exercises can open a dialog or menu. Keep that active surface clear
      // while the original step and its completion condition stay in effect.
      const surfaces = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"]:not(.tutorial-chapter-chooser), [role="menu"], .tutorial-workspace .topbar-dropdown, .tutorial-workspace .commit-search-toolbar__more-menu',
        ),
      ].filter(visible);
      const selected = [...document.querySelectorAll<HTMLElement>(target)].find(visible) || null;
      const surface = surfaces.at(-1);
      const next = surface && !surface.contains(selected) ? surface : selected || surface || null;
      if (next !== element) {
        restoreDescription();
        if (element) resize.unobserve(element);
        if (scrollArea) resize.unobserve(scrollArea);
        element = next;
        scrollArea = element?.closest<HTMLElement>('.dialog-content') ?? null;
        if (element) {
          previousDescription = element.getAttribute('aria-describedby');
          element.setAttribute('aria-describedby', 'tutorial-step-description');
          resize.observe(element);
          if (scrollArea) resize.observe(scrollArea);
          element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
      }
      let rect = element?.getBoundingClientRect() ?? null;
      const area = workspace?.getBoundingClientRect() ?? null;
      const clip = scrollArea?.getBoundingClientRect() ?? area;
      if (
        revealAfterResize &&
        rect &&
        area &&
        clip &&
        (rect.top < Math.max(area.top, clip.top) ||
          rect.bottom > Math.min(area.bottom, clip.bottom) ||
          rect.left < Math.max(area.left, clip.left) ||
          rect.right > Math.min(area.right, clip.right))
      ) {
        element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        rect = element?.getBoundingClientRect() ?? null;
      }
      revealAfterResize = false;
      setBounds((current) => (sameBox(current.rect, rect) && sameBox(current.workspace, area) ? current : { rect, workspace: area }));
      if (rect && rect.width > 0 && rect.height > 0) {
        setMissing(false);
        clearTimeout(timer);
        timer = undefined;
      } else if (!timer) timer = setTimeout(() => setMissing(true), 5000);
    }
    setMissing(false);
    setBounds({ rect: null, workspace: null });
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-hidden'] });
    window.addEventListener('resize', resized);
    document.addEventListener('visibilitychange', visibilityChanged);
    document.addEventListener('scroll', schedule, true);
    schedule();
    return () => {
      observer.disconnect();
      resize.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      clearTimeout(hiddenUpdate);
      window.removeEventListener('resize', resized);
      document.removeEventListener('visibilitychange', visibilityChanged);
      document.removeEventListener('scroll', schedule, true);
      restoreDescription();
    };
    // Restored dialogs may focus their initial control after the first scroll.
    // Re-enter once preparation settles so the actual step target is revealed.
  }, [target, prepared]);
  return { ...bounds, missing };
}
