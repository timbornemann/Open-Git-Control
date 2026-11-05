import { useLayoutEffect } from 'react';

/** The coach occupies real window space; dialogs and portaled menus must fit above it. */
export function useTutorialOverlayBounds() {
  useLayoutEffect(() => {
    const workspace = document.querySelector('.tutorial-workspace');
    if (!workspace) return;
    document.body.classList.add('tutorial-renderer');
    const update = () => {
      const box = workspace.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const values = { top: box.top, bottom: window.innerHeight - box.bottom, height: box.height };
      for (const [name, value] of Object.entries(values)) {
        const property = `--tutorial-overlay-${name}`;
        if (document.body.style.getPropertyValue(property) !== `${value}px`) document.body.style.setProperty(property, `${value}px`);
      }
      for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"]')) {
        if (!menu.getClientRects().length || !['fixed', 'absolute'].includes(getComputedStyle(menu).position)) continue;
        const rect = menu.getBoundingClientRect();
        const delta = Math.max(box.top + 8, Math.min(rect.top, box.bottom - rect.height - 8)) - rect.top;
        if (Math.abs(delta) > 0.5) menu.style.top = `${(Number.parseFloat(menu.style.top || getComputedStyle(menu).top) || 0) + delta}px`;
      }
    };
    const resize = new ResizeObserver(update);
    resize.observe(workspace);
    const mutations = new MutationObserver(update);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', update);
    update();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', update);
      document.body.classList.remove('tutorial-renderer');
      for (const name of ['top', 'bottom', 'height']) document.body.style.removeProperty(`--tutorial-overlay-${name}`);
    };
  }, []);
}
