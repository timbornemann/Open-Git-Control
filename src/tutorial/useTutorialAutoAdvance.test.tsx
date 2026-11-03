// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL_AUTO_ADVANCE_MS, useTutorialAutoAdvance } from './useTutorialAutoAdvance';

describe('tutorial automatic progression', () => {
  let root: Root;
  let container: HTMLDivElement;
  const next = vi.fn();
  function Harness({ stepId, complete, enabled, onAdvance }: { stepId: string; complete: boolean; enabled: boolean; onAdvance: () => void }) {
    useTutorialAutoAdvance(stepId, complete, enabled, onAdvance);
    return null;
  }
  function render(complete: boolean, enabled = true, stepId = 'stage', onAdvance = next) {
    act(() => root.render(<Harness stepId={stepId} complete={complete} enabled={enabled} onAdvance={onAdvance} />));
  }
  const tick = (milliseconds = TUTORIAL_AUTO_ADVANCE_MS) => act(() => vi.advanceTimersByTime(milliseconds));
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    next.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for a completed exercise and readable feedback, then advances exactly once', () => {
    render(false);
    tick();
    expect(next).not.toHaveBeenCalled();
    render(true);
    tick(TUTORIAL_AUTO_ADVANCE_MS - 1);
    expect(next).not.toHaveBeenCalled();
    tick(1);
    expect(next).toHaveBeenCalledOnce();
    render(false);
    render(true);
    tick();
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps information steps manual even though they are immediately complete', () => {
    render(true, false, 'orientation');
    tick(TUTORIAL_AUTO_ADVANCE_MS * 3);
    expect(next).not.toHaveBeenCalled();
  });

  it('cancels the pending transition when the completion condition is no longer met', () => {
    render(true);
    tick(300);
    render(false);
    tick();
    expect(next).not.toHaveBeenCalled();
    render(true);
    tick();
    expect(next).toHaveBeenCalledOnce();
  });

  it('pauses while choosing chapters or displaying an error and resumes with a fresh delay', () => {
    render(true);
    tick(300);
    render(true, false);
    tick(TUTORIAL_AUTO_ADVANCE_MS * 3);
    expect(next).not.toHaveBeenCalled();
    render(true);
    tick(TUTORIAL_AUTO_ADVANCE_MS - 1);
    expect(next).not.toHaveBeenCalled();
    tick(1);
    expect(next).toHaveBeenCalledOnce();
  });

  it('cancels an old checkpoint and permits a fresh attempt when returning to it', () => {
    render(true);
    tick(300);
    render(false, true, 'commit');
    tick();
    expect(next).not.toHaveBeenCalled();
    render(true, true, 'commit');
    tick();
    expect(next).toHaveBeenCalledOnce();
    render(true);
    tick();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('uses the latest callback without restarting the delay on unrelated renders', () => {
    const latest = vi.fn();
    render(true);
    tick(300);
    render(true, true, 'stage', latest);
    tick(TUTORIAL_AUTO_ADVANCE_MS - 300);
    expect(latest).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('discards the timer when the step is left manually or the tutorial ends', () => {
    render(true);
    tick(300);
    act(() => root.render(null));
    tick();
    expect(next).not.toHaveBeenCalled();
  });

  it('advances once with Strict Mode effect replays', () => {
    act(() =>
      root.render(
        <StrictMode>
          <Harness stepId="stage" complete enabled onAdvance={next} />
        </StrictMode>,
      ),
    );
    tick();
    expect(next).toHaveBeenCalledOnce();
  });
});
