// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { CsvTableEditor } from './CsvTableEditor';

describe('CsvTableEditor', () => {
  let root: Root | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  const renderEditor = (value: string, onChange: (nextValue: string) => void) => {
    root = createRoot(document.getElementById('root')!);
    act(() =>
      root?.render(
        createElement(I18nProvider, {
          language: 'en',
          children: createElement(CsvTableEditor, { value, onChange }),
        }),
      ),
    );
  };

  it('edits cells through a table and serializes the original delimiter', () => {
    const onChange = vi.fn();
    renderEditor('name;note\nAda;plain', onChange);
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Row 2, column B"]');
    if (!input) throw new Error('Missing CSV cell.');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'hello; world');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('name;note\nAda;"hello; world"');
  });

  it('adds rows and columns without dropping existing values', () => {
    const onChange = vi.fn();
    renderEditor('name,age\nAda,36', onChange);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.working-csv-editor__toolbar button')];

    act(() => buttons.find((button) => button.textContent?.includes('Row'))?.click());
    expect(onChange).toHaveBeenLastCalledWith('name,age\nAda,36\n,');

    act(() => buttons.find((button) => button.textContent?.includes('Column') && !button.textContent?.includes('Last'))?.click());
    expect(onChange).toHaveBeenLastCalledWith('name,age,\nAda,36,');
  });

  it('lets the user correct an ambiguous delimiter before editing', () => {
    renderEditor('1,23;apples\n2,50;pears', vi.fn());
    const delimiter = document.querySelector<HTMLSelectElement>('select[aria-label="CSV delimiter"]');
    if (!delimiter) throw new Error('Missing delimiter selector.');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(delimiter, ';');
      delimiter.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    expect(document.querySelector<HTMLInputElement>('input[aria-label="Row 1, column A"]')?.value).toBe('1,23');
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Row 1, column B"]')?.value).toBe('apples');
  });

  it('shows a useful error for malformed CSV input', () => {
    renderEditor('name,value\nAda,"unfinished', vi.fn());

    expect(document.body.textContent).toContain('CSV could not be read as a table.');
    expect(document.body.textContent).toContain('unterminated quoted field');
  });
});
