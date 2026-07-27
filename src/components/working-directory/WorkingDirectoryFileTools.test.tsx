// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingDirectoryFileTools } from './WorkingDirectoryFileTools';

const { setConfirmDialogMock, setInputDialogMock, showToastMock } = vi.hoisted(() => ({
  setConfirmDialogMock: vi.fn(),
  setInputDialogMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('@/contexts/AppStateContext', () => ({
  useUIContext: () => ({ setConfirmDialog: setConfirmDialogMock, setInputDialog: setInputDialogMock }),
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
    setInputDialogMock.mockReset();
    showToastMock.mockReset();
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const renderTools = (path: string, text: string, onChange = vi.fn()) => {
    const Harness = () => {
      const [value, setValue] = useState(text);
      return createElement(WorkingDirectoryFileTools, {
        path,
        text: value,
        onChange: (nextValue: string) => {
          onChange(nextValue);
          setValue(nextValue);
        },
      });
    };
    root = createRoot(document.getElementById('root')!);
    act(() => root?.render(createElement(Harness)));
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
    clickButton('JSON');
    clickButton('Format');
    expect(onChange).toHaveBeenLastCalledWith('{\n  "big": 12345678901234567890,\n  "items": [\n    1,\n    2\n  ]\n}');

    clickButton('Tools');
    clickButton('JSON');
    clickButton('Minify');
    expect(onChange).toHaveBeenLastCalledWith('{"big":12345678901234567890,"items":[1,2]}');
  });

  it('reports invalid JSON without modifying the editor', () => {
    const onChange = renderTools('config.json', '{"invalid": }');

    clickButton('Tools');
    clickButton('JSON');
    clickButton('Format');

    expect(onChange).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'), true);
  });

  it('minifies a tsconfig JSONC file with comments and trailing commas', () => {
    const onChange = renderTools('tsconfig.json', '{/* Bundler mode */"compilerOptions":{"module":"ESNext",},}');

    clickButton('Tools');
    clickButton('JSON');
    clickButton('Minify');

    expect(onChange).toHaveBeenCalledWith('{"compilerOptions":{"module":"ESNext"}}');
    expect(showToastMock).toHaveBeenCalledWith('JSON minified.', false);
  });

  it('requires confirmation before compacting ordinary text to one line', () => {
    const onChange = renderTools('notes.txt', ' first \n\n second ');

    clickButton('Tools');
    clickButton('Edit lines');
    clickButton('Compact to one line');
    expect(onChange).not.toHaveBeenCalled();
    const dialog = setConfirmDialogMock.mock.calls.at(-1)?.[0];
    expect(dialog).toMatchObject({ title: 'Compact text to one line?', confirmLabel: 'Compact' });
    act(() => dialog.onConfirm());
    expect(onChange).toHaveBeenCalledWith('first second');
  });

  it('offers general tools for CSV without offering JSON-specific tools', () => {
    renderTools('data.csv', 'name,value\nAda,1');

    clickButton('Tools');
    expect(document.body.textContent).toContain('Edit lines');
    expect(document.body.textContent).not.toContain('Format, validate and convert');
  });

  it('encodes only the current selection when one exists', () => {
    const onChange = vi.fn();
    root = createRoot(document.getElementById('root')!);
    act(() =>
      root?.render(
        createElement(WorkingDirectoryFileTools, {
          path: 'notes.txt',
          text: 'before ä after',
          selection: { from: 7, to: 8 },
          onChange,
        }),
      ),
    );

    clickButton('Tools');
    clickButton('Base64 and URL encoding');
    clickButton('Encode Base64');

    expect(onChange).toHaveBeenCalledWith('before w6Q= after');
  });

  it('marks encoding changes for the next save', () => {
    const onEncodingChange = vi.fn();
    root = createRoot(document.getElementById('root')!);
    act(() =>
      root?.render(
        createElement(WorkingDirectoryFileTools, {
          path: 'notes.txt',
          text: 'café',
          encoding: 'utf8',
          onChange: vi.fn(),
          onEncodingChange,
        }),
      ),
    );

    clickButton('Tools');
    clickButton('Encoding and line endings');
    clickButton('Latin-1');

    expect(onEncodingChange).toHaveBeenCalledWith('latin1');
  });
});
