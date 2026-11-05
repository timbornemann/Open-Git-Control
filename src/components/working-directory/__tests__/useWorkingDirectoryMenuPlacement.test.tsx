// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkingDirectoryMenuPlacement } from '../useWorkingDirectoryMenuPlacement';
let root: Root, host: HTMLDivElement;
let bounds = { left: 40, top: 44, right: 640, bottom: 400 };
const size = { width: window.innerWidth, height: window.innerHeight };
const context = { x: 950, y: 750 };
function Menu({ embedded }: { embedded: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const placement = useWorkingDirectoryMenuPlacement(context, ref);
  return (
    <div data-overlay-boundary={embedded ? '' : undefined}>
      <div ref={ref} className="menu" data-left={placement.left} data-top={placement.top} />
    </div>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.assign(window, { innerWidth: 1000, innerHeight: 800 });
  bounds = { left: 40, top: 44, right: 640, bottom: 400 };
  const rect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.hasAttribute('data-overlay-boundary')
      ? { ...bounds, x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top, toJSON: () => bounds }
      : rect.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(210);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(280);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Object.assign(window, { innerWidth: size.width, innerHeight: size.height });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('uses the regular window when there is no embedded boundary', () => {
  act(() => root.render(<Menu embedded={false} />));
  expect(host.querySelector('.menu')).toMatchObject({ dataset: { left: '782', top: '512' } });
});
it('keeps the menu inside the practice workspace and follows resizing', () => {
  act(() => root.render(<Menu embedded />));
  expect(host.querySelector('.menu')).toMatchObject({ dataset: { left: '422', top: '112' } });
  bounds = { left: 40, top: 44, right: 500, bottom: 350 };
  act(() => window.dispatchEvent(new Event('resize')));
  expect(host.querySelector('.menu')).toMatchObject({ dataset: { left: '282', top: '62' } });
});
