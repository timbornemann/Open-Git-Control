import { useEffect, useState } from 'react';

const selectors: Record<string, string> = {
  'inspect:diff': '[data-tutorial-route="diff"], [data-tutorial-route="file"], .working-tree-inspector.has-selection',
  'inspect:recovery': '[data-tutorial-route="recovery"], [data-tutorial-route="file"]',
  'diff-closed': '.file-viewer',
};

export function useTutorialViewCompletion(action?: string) {
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    setComplete(false);
    const selector = action && selectors[action];
    const workspace = document.querySelector('.tutorial-workspace');
    if (!selector || !workspace) return;
    let opened = false;
    const check = () => {
      const present = Boolean(workspace.querySelector(selector));
      if (action === 'diff-closed') {
        // Initial absence while the example is still loading is not a close.
        opened ||= present;
        setComplete(opened && !present && Boolean(workspace.querySelector('[data-tutorial-route="graph"]')));
      } else setComplete(present);
    };
    const observer = new MutationObserver(check);
    observer.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tutorial-route', 'class'] });
    check();
    return () => observer.disconnect();
  }, [action]);
  return complete;
}
