import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { RepositoryRunConfigStateDto } from '@/types/repositoryRun';
import { RepositoryRunMenu } from './RepositoryRunMenu';

describe('RepositoryRunMenu', () => {
  it('stays renderable when an older cache entry lacks derived actions', () => {
    const malformed = { version: 1, actions: {} } as unknown as RepositoryRunConfigStateDto;
    const menu = createElement(RepositoryRunMenu, {
      activeRepo: 'C:/repos/a',
      activeRunConfig: malformed,
      repositoryRun: null,
      hasUnreadResult: false,
      open: true,
      setOpen: vi.fn(),
      onStart: vi.fn().mockResolvedValue(false),
      onStop: vi.fn().mockResolvedValue(false),
      onOpenConsole: vi.fn(),
      onOpenSettings: vi.fn(),
    });
    const html = renderToStaticMarkup(createElement(I18nProvider, { language: 'en', children: menu }));
    expect(html).toContain('Run configuration');
    expect(html).toContain('Open run actions');
  });
});
