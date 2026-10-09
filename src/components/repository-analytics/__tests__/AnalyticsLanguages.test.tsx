// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
const render = (snapshot: ReturnType<typeof report>, language: 'de' | 'en' = 'de') =>
  act(() =>
    root.render(
      <I18nProvider language={language}>
        <AnalyticsLanguages snapshot={snapshot} />
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
});

describe('language and file type distribution', () => {
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
    expect(host.querySelector('.analytics-file-kinds')?.textContent).toContain('Binärdateien18');
    expect(host.querySelector('.analytics-file-kinds')?.textContent).toContain('LFS1');
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
    expect(host.textContent).toContain('Keine Textdateien im gewählten Projektstand.');
    expect(host.textContent).toContain('Binärdateien18');
    render({ ...snapshot, sections: [] });
    expect(host.textContent).toContain('Sprachen und Dateitypen werden noch ermittelt');
    expect(host.querySelector('.analytics-file-kinds')).toBeNull();
  });
});
