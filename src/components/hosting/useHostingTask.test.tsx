// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHostingTask } from './useHostingTask';

let root: Root;
let current: ReturnType<typeof useHostingTask>;
function Harness({ scope }: { scope: string }) {
  current = useHostingTask(scope);
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness, { scope: 'a' })));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});
describe('hosting task repository isolation', () => {
  it('ignores completions and failures from a previous account/repository', async () => {
    let complete!: (value: string) => void;
    let applied = false;
    let pending!: Promise<unknown>;
    act(() => {
      pending = current.run(
        () =>
          new Promise<string>((resolve) => {
            complete = resolve;
          }),
        () => {
          applied = true;
        },
      );
    });
    expect(current.busy).toBe(true);
    act(() => root.render(createElement(Harness, { scope: 'b' })));
    await act(async () => {
      complete('old');
      await pending;
    });
    expect(applied).toBe(false);
    expect(current.busy).toBe(false);
    expect(current.error).toBeNull();
    await act(async () =>
      current.run(async () => {
        throw new Error('permission denied');
      }),
    );
    expect(current.error).toBe('permission denied');
  });
  it('keeps progress active until all operations in the same scope finish', async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = current.run(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      );
      second = current.run(
        () =>
          new Promise<void>((resolve) => {
            finishSecond = resolve;
          }),
      );
    });
    await act(async () => {
      finishFirst();
      await first;
    });
    expect(current.busy).toBe(true);
    await act(async () => {
      finishSecond();
      await second;
    });
    expect(current.busy).toBe(false);
  });
});
