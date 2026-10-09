// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsLanguages } from '../AnalyticsLanguages';

let host: HTMLDivElement, root: Root;
function report(): Pick<RepositoryAnalyticsSnapshot, 'project' | 'sections'> {
  return {
    sections: ['project'],
    project: {
      oid: 'a'.repeat(40),
      files: 29,
      textFiles: 10,
      binaryFiles: 18,
      lfsFiles: 1,
      symlinks: 0,
      submodules: 0,
      excludedFiles: 0,
      lines: 1000,
      blamedLines: 1000,
      unblamedFiles: 0,
      ownership: [],
      languages: [
        { language: 'TypeScript', files: 7, lines: 815 },
        { language: 'CSS', files: 2, lines: 93 },
        { language: 'JSON', files: 1, lines: 92 },
      ],
    },
  };
}
const render = (snapshot: ReturnType<typeof report>, language: 'de' | 'en' = 'de', compact = false) =>
  act(() =>
    root.render(
      <I18nProvider language={language}>
        <AnalyticsLanguages snapshot={snapshot} compact={compact} />
      </I18nProvider>,
    ),
  );
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('language and file type distribution', () => {
  it('prefers one column when all types fit, uses two when needed and keeps full details reachable at small heights', () => {
    let height = 500;
    let resize!: () => void;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 430, height }) as DOMRect);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const snapshot = report();
    snapshot.project.binaryFiles = snapshot.project.lfsFiles = 0;
    snapshot.project.languages = Array.from({ length: 8 }, (_, index) => ({ language: `Type ${index}`, files: 1, lines: 120 }));
    snapshot.project.languages.push({ language: '.gitignore', files: 1, lines: 1 });
    render(snapshot, 'en', true);
    const list = () => host.querySelector('.analytics-language-list')!;
    expect(list().classList.contains('analytics-language-list--columns')).toBe(false);
    expect(list().children).toHaveLength(9);
    height = 260;
    act(() => resize());
    expect(list().classList.contains('analytics-language-list--columns')).toBe(true);
    expect(list().children).toHaveLength(9);
    height = 140;
    act(() => resize());
    expect(list().children).toHaveLength(4);
    expect(list().lastElementChild?.textContent).toContain('Other');
    const show = host.querySelector<HTMLButtonElement>('.analytics-language-body > button')!;
    act(() => show.click());
    expect(host.querySelector('.analytics-languages-expanded .analytics-language-list')?.children).toHaveLength(9);
    expect(host.querySelector('.analytics-languages-expanded .analytics-language-list--columns')).toBeNull();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    height = 50;
    act(() => resize());
    expect(list().children).toHaveLength(0);
    expect(host.querySelector('.analytics-language-body > button')).toBeTruthy();
  });
  it('uses proportional CSS widths independently of localized percentages and keeps file counts separate', () => {
    render(report());
    expect(host.querySelector('table')).toBeNull();
    expect([...host.querySelectorAll('.analytics-language-percent')].map((node) => node.textContent)).toEqual(['81,5%', '9,3%', '9,2%']);
    expect([...host.querySelectorAll<HTMLElement>('.analytics-language-bar > span')].map((node) => node.style.width)).toEqual(['81.5%', '9.3%', '9.2%']);
    expect([...host.querySelectorAll<HTMLElement>('.analytics-language-distribution > span')].map((node) => node.style.width)).toEqual([
      '81.5%',
      '9.3%',
      '9.2%',
    ]);
    expect(host.querySelector('.analytics-language-details')?.textContent).toBe('7 Dateien · 815 Zeilen');
    const files = host.querySelectorAll('.analytics-language-list .analytics-language-item--files');
    expect([...files].map((node) => node.textContent)).toEqual(['Binärdateien18 Dateien', 'LFS1 Datei']);
    for (const row of files) {
      expect(row.querySelector('.analytics-language-details')).toBeNull();
      expect(row.querySelector('.analytics-language-bar')).toBeNull();
      expect(row.querySelector('.analytics-language-percent')).toBeNull();
    }
    render(report(), 'en');
    expect(host.querySelector('.analytics-language-percent')?.textContent).toBe('81.5%');
    expect(host.querySelector<HTMLElement>('.analytics-language-bar > span')?.style.width).toBe('81.5%');
  });
  it('keeps small nonzero shares visible in text without inflating their bars', () => {
    const snapshot = report();
    snapshot.project.lines = 100000;
    snapshot.project.languages = [{ language: '.gitignore', files: 1, lines: 1 }];
    render(snapshot);
    expect(host.querySelector('.analytics-language-percent')?.textContent).toBe('<0,1%');
    expect(host.querySelector<HTMLElement>('.analytics-language-bar > span')?.style.width).toBe('0.001%');
    expect(host.querySelector('.analytics-language-name')?.textContent).toBe('Sonstige');
    expect(host.querySelector('.analytics-language-item')?.getAttribute('title')).toBe('.gitignore');
  });
  it('groups individual shares at and below 0.1% and preserves their combined counts and lines', () => {
    const snapshot = report();
    snapshot.project.lines = 10000;
    snapshot.project.languages = [
      { language: 'TypeScript', files: 20, lines: 9971 },
      { language: 'CSS', files: 1, lines: 11 },
      { language: '.gitignore', files: 1, lines: 10 },
      { language: '.license', files: 3, lines: 8 },
      { language: 'Empty', files: 2, lines: 0 },
    ];
    render(snapshot, 'en');
    expect([...host.querySelectorAll('.analytics-language-name')].map((node) => node.textContent)).toEqual([
      'TypeScript',
      'CSS',
      'Other',
      'Binary files',
      'LFS',
    ]);
    expect([...host.querySelectorAll('.analytics-language-details')].map((node) => node.textContent)).toEqual([
      '20 files · 9,971 lines',
      '1 file · 11 lines',
      '6 files · 18 lines',
    ]);
    expect(host.querySelectorAll('.analytics-language-percent')[2].textContent).toBe('0.2%');
    expect(host.querySelectorAll<HTMLElement>('.analytics-language-bar > span')[2].style.width).toBe('0.18%');
    expect(host.querySelectorAll('.analytics-language-item')[2].getAttribute('title')).toBe('.gitignore · .license · Empty');
  });
  it('handles zero text lines and distinguishes pending project data from non-text-only projects', () => {
    const snapshot = report();
    snapshot.project.lines = 0;
    snapshot.project.languages = [{ language: 'Text', files: 1, lines: 0 }];
    render(snapshot);
    expect(host.querySelector('.analytics-language-distribution')).toBeNull();
    expect(host.querySelector<HTMLElement>('.analytics-language-bar > span')?.style.width).toBe('0%');
    snapshot.project.languages = [];
    render(snapshot);
    expect(host.querySelectorAll('.analytics-language-list .analytics-language-item--files')).toHaveLength(2);
    expect(host.textContent).toContain('Binärdateien18 Dateien');
    render({ ...snapshot, sections: [] });
    expect(host.textContent).toContain('Sprachen und Dateitypen werden noch ermittelt');
    expect(host.querySelector('.analytics-language-item')).toBeNull();
  });
  it('reserves room for file counts in the compact list and includes all categories in the full view', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 430, height: 140 } as DOMRect);
    const snapshot = report();
    snapshot.project.symlinks = 2;
    snapshot.project.submodules = 1;
    render(snapshot, 'en', true);
    expect(host.querySelectorAll('.analytics-language-item')).toHaveLength(4);
    expect(host.querySelector('.analytics-language-body')?.textContent).toContain('Binary files18 files');
    act(() => host.querySelector<HTMLButtonElement>('.analytics-language-body > button')!.click());
    const full = host.querySelector('.analytics-languages-expanded')!;
    expect(full.querySelectorAll('.analytics-language-item')).toHaveLength(7);
    expect(full.textContent).toContain('Symlinks2 files');
    expect(full.textContent).toContain('Submodules1 file');
  });
});
