let captureCount = 0;
export const beginShortcutCapture = () => {
  captureCount++;
  let released = false;
  return () => {
    if (!released) {
      captureCount--;
      released = true;
    }
  };
};
export const isShortcutCaptureActive = () => captureCount > 0;
export const isShortcutDialogOpen = (ignoreRepositorySwitcher = false) =>
  Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], .cmd-palette-modal')).some(
    (element) => !element.closest('[hidden], [aria-hidden="true"]') && !(ignoreRepositorySwitcher && element.matches('.repo-switcher-modal')),
  );
export const isShortcutSuppressed = (ignoreRepositorySwitcher = false) => isShortcutCaptureActive() || isShortcutDialogOpen(ignoreRepositorySwitcher);
export function isShortcutEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : document.activeElement;
  return Boolean(element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor'));
}
