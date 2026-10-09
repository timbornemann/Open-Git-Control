// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { DEFAULT_ANALYTICS_FILTERS, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { AnalyticsContributors } from '../AnalyticsContributors';

let host: HTMLDivElement, root: Root;
const onPerson = vi.fn();
function report(): RepositoryAnalyticsSnapshot {
  const alice = { id: 'alice', name: 'Alex', email: 'alice@test.invalid' };
  const bob = { id: 'bob', name: 'Alex', email: 'bob@test.invalid' };
  const cara = { id: 'cara', name: 'Cara', email: 'cara@test.invalid' };
  return {
    id: 'test',
    repoPath: 'C:/repo',
    savedAt: 1000,
    complete: true,
    filters: { ...DEFAULT_ANALYTICS_FILTERS, since: '2026-10-01', until: '2026-10-09', revision: 'v1.0.0' },
    sections: ['history', 'project', 'blame'],
    authors: [alice, bob, cara],
    refs: [],
    tags: [],
    head: 'a'.repeat(40),
    totals: { commits: 7, merges: 1, contributors: 3, firstActivity: 1000, lastActivity: 2000 },
    filteredCommits: 5,
    additions: 140,
    deletions: 15,
    excludedCouplingCommits: 0,
    contributors: [
      { ...alice, commits: 3, merges: 1, files: 4, additions: 100, deletions: 10, lines: 800 },
      { ...bob, commits: 2, merges: 0, files: 2, additions: 40, deletions: 5, lines: 0 },
    ],
    periods: [],
    calendar: [],
    hotspots: [],
    directories: [],
    coupling: [],
    comparison: null,
    warnings: [],
    project: {
      oid: 'b'.repeat(40),
      files: 6,
      textFiles: 6,
      binaryFiles: 0,
      lfsFiles: 0,
      symlinks: 0,
      submodules: 0,
      excludedFiles: 0,
      lines: 1000,
      blamedLines: 1000,
      unblamedFiles: 0,
      languages: [],
      ownership: [
        { ...alice, lines: 800 },
        { ...cara, lines: 200 },
      ],
    },
  };
}
function render(snapshot = report(), language: 'en' | 'de' = 'en') {
  act(() =>
    root.render(
      <I18nProvider language={language}>
        <AnalyticsContributors snapshot={snapshot} onPerson={onPerson} />
      </I18nProvider>,
    ),
  );
}
function row(email: string) {
  return [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((node) => node.querySelector('small')?.textContent === email)!;
}
const values = (email: string) => [...row(email).querySelectorAll('td')].slice(1).map((node) => node.textContent);
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onPerson.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe('activity and current line attribution per contributor', () => {
  it('joins people by Git identity, preserves same-name identities and includes owners without activity', () => {
    render();
    expect(host.querySelectorAll('table')).toHaveLength(1);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(values('alice@test.invalid')).toEqual(['3', '1', '4', '+100', '−10', '800', '80%']);
    expect(values('bob@test.invalid')).toEqual(['2', '0', '2', '+40', '−5', '0', '0%']);
    expect(values('cara@test.invalid')).toEqual(['0', '0', '0', '+0', '−0', '200', '20%']);
    expect(host.querySelector('.analytics-contributors-coverage')?.textContent).toContain('(100%)');
    act(() => row('bob@test.invalid').querySelector<HTMLButtonElement>('button')!.click());
    expect(onPerson).toHaveBeenCalledWith('bob');
  });
  it('keeps the project tree distinct from filtered activity and retains the full-project share denominator', () => {
    const saved = report();
    saved.filters.author = 'cara';
    saved.contributors = [];
    render(saved);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(values('cara@test.invalid')).toEqual(['0', '0', '0', '+0', '−0', '200', '20%']);
    expect(host.querySelector('.analytics-description')?.textContent).toContain('Activity follows history filters.');
    expect(host.querySelector('.analytics-description strong')?.textContent).toBe('v1.0.0');
  });
  it('shows partial attribution and coverage without claiming missing people have zero lines', () => {
    const saved = report();
    saved.sections = ['history', 'project'];
    saved.project.blamedLines = 400;
    saved.project.ownership = [{ ...saved.authors[0], lines: 400 }];
    render(saved);
    expect(values('alice@test.invalid').slice(-2)).toEqual(['400', '100%']);
    expect(values('bob@test.invalid').slice(-2)).toEqual(['—', '—']);
    expect(host.querySelector('.analytics-contributors-coverage')?.textContent).toContain('(40%)');
    expect(host.querySelector('.analytics-contributors-coverage')?.textContent).toContain('Line attribution incomplete');
    saved.sections.push('blame');
    saved.project.unblamedFiles = 1;
    render(saved);
    expect(values('bob@test.invalid').slice(-2)).toEqual(['—', '—']);
    expect(host.querySelector('.analytics-contributors-coverage')?.textContent).toContain('1 file could not be attributed');
    expect(host.querySelector('.analytics-contributors-coverage')?.textContent).not.toContain('Line attribution incomplete');
  });
  it('keeps an existing person row and keyboard focus when blame results arrive', () => {
    const saved = report();
    saved.sections = ['history', 'project'];
    saved.project.ownership = [];
    saved.project.blamedLines = 0;
    render(saved);
    const person = row('alice@test.invalid');
    const button = person.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    render(report());
    expect(row('alice@test.invalid')).toBe(person);
    expect(document.activeElement).toBe(button);
    expect(values('alice@test.invalid').slice(-2)).toEqual(['800', '80%']);
  });
  it('explains an empty selection and uses the app language', () => {
    const saved = report();
    saved.contributors = [];
    saved.project.ownership = [];
    saved.project.lines = saved.project.blamedLines = 0;
    render(saved, 'de');
    expect(host.querySelector('h3')?.textContent).toBe('Mitwirkende');
    expect(host.textContent).toContain('Keine Mitwirkenden für diese Auswahl.');
    expect(host.querySelector('.analytics-contributors-coverage')?.textContent).toBe('Zeilenabdeckung: 0 / 0');
    expect(host.textContent).not.toContain('NaN');
    expect(host.textContent).not.toContain('100%');
  });
});
