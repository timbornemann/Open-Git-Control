import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { GitSubmoduleInfo } from '@/types/git';
import { trByLanguage, translateFromCatalog, type AppLanguage } from '@/i18nCore';
import { SubmodulePanel } from './SubmodulePanel';
let language: AppLanguage = 'en';
vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => translateFromCatalog(language, key),
    tr: (de: string, en: string) => trByLanguage(language, de, en),
  }),
}));
const labels = {
  clean: ['Zielcommit ausgecheckt', 'Recorded commit checked out'],
  uninitialized: ['Nicht initialisiert', 'Not initialized'],
  dirty: ['Anderer Commit ausgecheckt', 'Different commit checked out'],
  conflicted: ['Konflikt', 'Conflict'],
  unknown: ['Status unbekannt', 'Unknown status'],
};
const cases = (['de', 'en'] as const).flatMap((locale) =>
  (['clean', 'uninitialized', 'dirty', 'conflicted', 'unknown'] as const).map((state) => ({ locale, state })),
);
it.each(cases)('describes the actual $state submodule state in $locale', ({ locale, state }) => {
  language = locale;
  const entry: GitSubmoduleInfo = {
    path: 'packages/design',
    commit: 'a'.repeat(40),
    stateCode: state,
    isDirty: state === 'dirty' || state === 'conflicted',
    summary: 'v1.0.0',
  };
  const html = renderToStaticMarkup(
    createElement(SubmodulePanel, {
      submodules: [entry],
      collapsed: false,
      onToggleCollapsed: vi.fn(),
      onInitUpdate: vi.fn(),
      onSync: vi.fn(),
      onOpenSubmodule: vi.fn(),
    }),
  );
  expect(html).toContain(labels[state][locale === 'de' ? 0 : 1]);
  expect(html).toContain(locale === 'de' ? 'Submodulordner im Dateimanager öffnen' : 'Open submodule folder in file manager');
});
