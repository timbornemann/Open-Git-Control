// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TagPanel } from './TagPanel';
vi.mock('@/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, tr: (_de: string, en: string) => en }) }));
let host: HTMLDivElement, root: Root;
const select = vi.fn(),
  remove = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <TagPanel
        tags={['v1.0.0']}
        tagConflicts={[]}
        onSelectTag={select}
        onDeleteTag={remove}
        onCreateTag={() => undefined}
        onPushTags={() => undefined}
        collapsed={false}
        onToggleCollapsed={() => undefined}
      />,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it.each(['Enter', ' '])('opens a focused tag with %s', (key) => {
  act(() => host.querySelector('.tag-card')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
  expect(select).toHaveBeenCalledExactlyOnceWith('v1.0.0');
  expect(remove).not.toHaveBeenCalled();
});
it.each(['Enter', ' '])('does not navigate to the tag when %s activates its nested delete button', (key) => {
  const button = host.querySelector<HTMLButtonElement>('.tag-card-delete')!;
  act(() => {
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
  expect(select).not.toHaveBeenCalled();
  act(() => button.click());
  expect(remove).toHaveBeenCalledExactlyOnceWith('v1.0.0');
  expect(select).not.toHaveBeenCalled();
});
