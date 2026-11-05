// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { emitTutorialFeedback, TUTORIAL_FEEDBACK_EVENT } from './feedback';
afterEach(() => vi.unstubAllGlobals());
it.each([{ tutorialHost: undefined }, { tutorialHost: {}, electronAPI: {} }])(
  'does not emit tutorial receipts outside the isolated renderer: %j',
  (context) => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { ...context, dispatchEvent });
    emitTutorialFeedback('result', false);
    expect(dispatchEvent).not.toHaveBeenCalled();
  },
);
it('emits only the result message and error flag within the isolated renderer', () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { tutorialHost: {}, dispatchEvent });
  emitTutorialFeedback('Invalid YAML', true);
  const event = dispatchEvent.mock.calls[0][0] as CustomEvent;
  expect(event.type).toBe(TUTORIAL_FEEDBACK_EVENT);
  expect(event.detail).toEqual({ message: 'Invalid YAML', isError: true });
});
