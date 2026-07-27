// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryFileTools } from './WorkingDirectoryFileTools';

const { setConfirmDialogMock, showToastMock } = vi.hoisted(() => ({
  setConfirmDialogMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: setConfirmDialogMock }),
}));
vi.mock('@/hooks/useAppToast', () => ({
  useAppToast: () => showToastMock,
}));
vi.mock('@/i18n', () => ({
  useI18n: () => ({ tr: (_german: string, english: string) => english }),
}));

describe('WorkingDirectoryFileTools', () => {
  let root: Root | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    setConfirmDialogMock.mockReset();
    showToastMock.mockReset();
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const renderTools = (path: string, text: string, onChange = vi.fn()) => {
    root = createRoot(document.getElementById('root')!);
    act(() => root?.render(createElement(WorkingDirectoryFileTools, { path, text, onChange })));
    return onChange;
  };

  const clickButton = (label: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.includes(label));
    if (!button) throw new Error(`Missing "${label}" button.`);
    act(() => button.click());
  };

  it('formats and minifies JSON into the unsaved editor buffer', () => {
    const onChange = renderTools('config.json', '{"big":12345678901234567890,"items":[1,2]}');

    clickButton('Tools');
    clickButton('Format JSON');
    expect(onChange).toHaveBeenLastCalledWith('{\n  "big": 12345678901234567890,\n  "items": [\n    1,\n    2\n  ]\n}');

    clickButton('Tools');
    clickButton('Minify JSON');
    expect(onChange).toHaveBeenLastCalledWith('{"big":12345678901234567890,"items":[1,2]}');
  });

  it('reports invalid JSON without modifying the editor', () => {
    const onChange = renderTools('config.json', '{"invalid": }');

    clickButton('Tools');
    clickButton('Format JSON');

    expect(onChange).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'), true);
  });

  it('minifies a tsconfig JSONC file with comments and trailing commas', () => {
    const onChange = renderTools('tsconfig.json', '{/* Bundler mode */"compilerOptions":{"module":"ESNext",},}');

    clickButton('Tools');
    clickButton('Minify JSON');

    expect(onChange).toHaveBeenCalledWith('{"compilerOptions":{"module":"ESNext"}}');
    expect(showToastMock).toHaveBeenCalledWith('JSON minified. Save to apply it.', false);
  });

  it('requires confirmation before compacting ordinary text to one line', () => {
    const onChange = renderTools('notes.txt', ' first \n\n second ');

    clickButton('Tools');
    clickButton('Compact to one line');
    expect(onChange).not.toHaveBeenCalled();
    const dialog = setConfirmDialogMock.mock.calls.at(-1)?.[0];
    expect(dialog).toMatchObject({ title: 'Compact text to one line?', confirmLabel: 'Compact' });
    act(() => dialog.onConfirm());
    expect(onChange).toHaveBeenCalledWith('first second');
  });

  it('leaves CSV transformations to the dedicated table editor', () => {
    renderTools('data.csv', 'name,value\nAda,1');

    expect(document.querySelector('button')).toBeNull();
  });
});
