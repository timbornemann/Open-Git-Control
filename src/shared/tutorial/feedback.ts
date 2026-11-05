export const TUTORIAL_FEEDBACK_EVENT = 'ogc:tutorial-feedback';
export type TutorialFeedback = { message: string; isError: boolean };

/** A result receipt within the isolated renderer, including deduplicated toasts. */
export function emitTutorialFeedback(message: string, isError: boolean) {
  if (typeof window === 'undefined') return;
  const bridge = window as Window & { tutorialHost?: unknown; electronAPI?: unknown };
  if (!bridge.tutorialHost || bridge.electronAPI) return;
  window.dispatchEvent(new CustomEvent<TutorialFeedback>(TUTORIAL_FEEDBACK_EVENT, { detail: { message, isError } }));
}
