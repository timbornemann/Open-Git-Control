// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BlamePanel } from './BlamePanel';
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en, t: (key: string) => key }) }));
it('navigates to real commits and keeps uncommitted lines from opening the zero object ID or an epoch date', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    select = vi.fn(),
    date = vi.fn(() => '20 Oct 2026');
  const lines = [
    {
      lineNumber: 1,
      commitHash: '00000000' + 'a'.repeat(32),
      abbrevHash: '0000000',
      author: 'Alex',
      authorTime: '1792483200',
      summary: 'Saved change',
      content: 'Saved line',
    },
    {
      lineNumber: 2,
      commitHash: '0'.repeat(40),
      abbrevHash: '0000000',
      author: 'Not Committed Yet',
      authorTime: '0',
      summary: 'Working changes',
      content: 'Uncommitted line',
    },
  ];
  try {
    act(() =>
      root.render(
        <BlamePanel
          lines={lines}
          loading={false}
          error={null}
          hasMore={false}
          variant="detailed"
          formatBlameDate={date}
          onLoadMore={vi.fn()}
          onSelectCommit={select}
        />,
      ),
    );
    const buttons = host.querySelectorAll<HTMLButtonElement>('.file-blame-line__commit');
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[1].textContent).toBe('Not committed yet');
    expect(host.querySelectorAll('.file-blame-line__date')).toHaveLength(1);
    expect(date).toHaveBeenCalledExactlyOnceWith('1792483200');
    act(() => {
      buttons[0].click();
      buttons[1].click();
    });
    expect(select).toHaveBeenCalledExactlyOnceWith(lines[0].commitHash);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
