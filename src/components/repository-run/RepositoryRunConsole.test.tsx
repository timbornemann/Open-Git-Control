// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type AppLanguage } from '@/i18n';
import { useRepositoryTodoDraftState } from '@/components/project-planner/repositoryTodoDraftState';
import { sampleRun } from '@/utils/__tests__/repositoryRunFixture';
import { RepositoryRunConsole } from './RepositoryRunConsole';
import type { RepositoryRunFileLinkProps } from './RepositoryRunLinkedText';

const mocks = vi.hoisted(() => ({ copy: vi.fn(), toast: vi.fn(), stop: vi.fn(), back: vi.fn(), openFile: vi.fn() }));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: mocks.copy }));
vi.mock('@/contexts/AppStateContext', () => ({ useRepositoryContext: () => ({ onToast: mocks.toast }) }));
let host: HTMLDivElement, root: Root;
const render = (run = sampleRun(), onOpenFile?: RepositoryRunFileLinkProps['onOpenFile'], language: AppLanguage = 'en') =>
  act(async () =>
    root.render(
      <I18nProvider language={language}>
        <RepositoryRunConsole run={run} onStop={mocks.stop} onBack={mocks.back} onOpenFile={onOpenFile} />
      </I18nProvider>,
    ),
  );
const click = (label: string) =>
  act(async () => {
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
    expect(button, label).toBeTruthy();
    button!.click();
  });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useRepositoryTodoDraftState.setState({ request: null });
  mocks.copy.mockResolvedValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useRepositoryTodoDraftState.setState({ request: null });
});

describe('repository run console presentation', () => {
  it.each(['de', 'en'] as const)('copies the selected problem with folded details and run context in %s without creating a bug', async (language) => {
    const run = sampleRun();
    run.steps[0].command = 'pnpm --filter @a3/desktop tauri dev';
    run.steps[0].shell = 'powershell';
    await render(run, undefined, language);
    await click(language === 'de' ? 'Probleme (2)' : 'Problems (2)');
    const error = host.querySelector('.repository-run-console__problem.error')!;
    const buttons = [...error.querySelectorAll('button')];
    const label = language === 'de' ? 'Bug-Infos kopieren' : 'Copy bug info';
    const copyButton = buttons.find((button) => button.textContent?.trim() === label)!;
    expect(copyButton.previousElementSibling?.textContent?.trim()).toBe(language === 'de' ? 'Als Bug aufnehmen' : 'Add as bug');
    expect(error.querySelector('details')?.open).toBe(false);
    await act(async () => copyButton.click());

    expect(mocks.copy).toHaveBeenCalledOnce();
    const report = mocks.copy.mock.calls[0][0];
    expect(report).toContain(language === 'de' ? 'Meldung:\nError: Port 5173 is already in use' : 'Message:\nError: Port 5173 is already in use');
    expect(report).toContain('httpServerStart');
    expect(report).toContain('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL');
    expect(report).toContain('pnpm --filter @a3/desktop tauri dev');
    expect(report).toContain(run.repoPath);
    expect(report).toContain('5173');
    expect(report).not.toContain('\u001b');
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(language === 'de' ? 'Bug-Infos kopiert.' : 'Bug info copied.', false);
    expect(useRepositoryTodoDraftState.getState().request).toBeNull();
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain(language === 'de' ? 'Probleme' : 'Problems');
  });

  it('copies a warning with its occurrence count and reports a clipboard failure', async () => {
    mocks.copy.mockResolvedValue(false);
    await render();
    await click('Problems (2)');
    const warning = host.querySelector('.repository-run-console__problem.warning')!;
    const copyButton = [...warning.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Copy bug info')!;
    await act(async () => copyButton.click());

    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining('Severity: Warning'));
    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining('Occurrences: 3'));
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith('Could not copy to the clipboard.', true);
    expect(useRepositoryTodoDraftState.getState().request).toBeNull();
  });

  it('also offers the problem copy action in the run summary', async () => {
    await render();
    await click('Summary');
    await click('Copy bug info');
    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining('Unsupported engine'));
    expect(mocks.toast).toHaveBeenCalledWith('Bug info copied.', false);
  });

  it('opens working files from structured output, plain output, diagnostic locations and technical details', async () => {
    const run = sampleRun();
    run.steps[0].parser = 'typescript';
    run.output = [
      { ...run.output[0], stream: 'stderr', text: 'src/main.ts(7,3): error TS2322: Invalid type' },
      { ...run.output[0], stream: 'stderr', sequence: 2, text: '    at render (file:///D:/Projects/Software/A%5E3/src/view.ts:11:2)' },
    ];
    await render(run, mocks.openFile);
    await click('src/main.ts(7,3)');
    expect(mocks.openFile).toHaveBeenLastCalledWith({ path: 'src/main.ts', line: 7, column: 3 });
    await click('file:///D:/Projects/Software/A%5E3/src/view.ts:11:2');
    expect(mocks.openFile).toHaveBeenLastCalledWith({ path: 'src/view.ts', line: 11, column: 2 });
    await click('Plain text');
    await click('src/main.ts(7,3)');
    expect(mocks.openFile).toHaveBeenLastCalledWith({ path: 'src/main.ts', line: 7, column: 3 });
    await click('Problems (1)');
    await click('src/main.ts:7:3');
    expect(mocks.openFile).toHaveBeenLastCalledWith({ path: 'src/main.ts', line: 7, column: 3 });
    expect(host.querySelector('.repository-run-console__file-link')?.getAttribute('title')).toContain('Open in app editor');
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('keeps external and out-of-repository paths as plain text and copies the original diagnostic', async () => {
    const run = sampleRun();
    run.steps[0].parser = 'typescript';
    const text = 'C:/Other/repo/main.ts:4:2: error TS2322: Read https://example.com/main.ts:1:2';
    run.output = [{ ...run.output[0], stream: 'stderr', text }];
    await render(run, mocks.openFile);
    expect(host.querySelector('.repository-run-console__file-link')).toBeNull();
    await click('Problems (1)');
    expect(host.querySelector('.repository-run-console__file-link')).toBeNull();
    await click('Copy problems');
    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining('C:/Other/repo/main.ts:4:2'));
    expect(mocks.openFile).not.toHaveBeenCalled();
  });
  it('shows the reported root cause and folded readable tool output instead of control characters or red stderr information', async () => {
    await render();
    expect(host.textContent).not.toContain('\u001b');
    expect(host.querySelector('.repository-run-console__failure')?.textContent).toContain('Stop the other development server on port 5173');
    expect(host.textContent).toContain('Problems (2)');
    const warning = host.querySelector('.repository-run-console__entry.repository-run-console__line--warning')!;
    expect(warning.textContent).toContain('×3');
    expect(warning.querySelector('details')?.open).toBe(false);
    expect(host.querySelector('.repository-run-console__line--watch')?.textContent).toContain('Watching 13 paths');
    expect(host.querySelector('.repository-run-console__line--info')?.textContent).toContain('workspace inheritance');
    expect(host.querySelector('.repository-run-console__line--stderr')).toBeNull();
    const error = [...host.querySelectorAll('.repository-run-console__entry')].find((entry) => entry.textContent?.includes('Error: Port 5173'))!;
    expect(error.querySelector('details')?.textContent).toContain('httpServerStart');
    expect(error.querySelector('details')?.open).toBe(false);
  });
  it('provides the full clean transcript, safe copying, filters and a link from each problem to its output', async () => {
    await render();
    await click('Copy output');
    const copied = mocks.copy.mock.calls[0][0];
    expect(copied).not.toContain('\u001b');
    expect(copied.match(/Unsupported engine/g)).toHaveLength(3);
    expect(copied).toContain('module-12');
    expect(copied).toContain('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL');
    await click('Plain text');
    expect(host.querySelector('.repository-run-console__transcript')?.textContent).toBe(copied + '\n');
    const filter = host.querySelector<HTMLSelectElement>('[aria-label="Filter output"]')!;
    await act(async () => {
      filter.value = 'warning';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('.repository-run-console__transcript')?.textContent).not.toContain('httpServerStart');
    await click('Problems (2)');
    expect(host.querySelectorAll('.repository-run-console__problem')).toHaveLength(2);
    const show = host.querySelector('.repository-run-console__problem.error button') as HTMLButtonElement;
    await act(async () => show.click());
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Console');
    expect(host.querySelector('.repository-run-console__transcript')?.textContent).toContain('httpServerStart');
    expect(host.querySelector('[aria-label="Filter output"]')?.getAttribute('value')).not.toBe('warning');
    expect(host.querySelector('.repository-run-console__follow')?.getAttribute('aria-pressed')).toBe('false');
    const pane = host.querySelector<HTMLDivElement>('.repository-run-console__output')!;
    await act(async () => pane.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(host.querySelector('.repository-run-console__follow')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.repository-run-console__transcript .is-target')?.textContent).toContain('Port 5173');
  });
  it('retains expanded details and manual scroll position as new output arrives, and supports following again', async () => {
    const run = sampleRun();
    run.status = 'running';
    await render(run);
    const details = host.querySelector('.repository-run-console__entry.repository-run-console__line--warning details') as HTMLDetailsElement;
    details.open = true;
    const pane = host.querySelector<HTMLDivElement>('.repository-run-console__output')!;
    Object.defineProperties(pane, { scrollHeight: { configurable: true, value: 2000 }, clientHeight: { value: 300 } });
    pane.scrollTop = 100;
    await act(async () => pane.dispatchEvent(new Event('scroll', { bubbles: true })));
    await render({ ...run, output: [...run.output, { ...run.output[1], sequence: 100 }] });
    expect(host.querySelector('.repository-run-console__entry.repository-run-console__line--warning details')).toBe(details);
    expect(details.open).toBe(true);
    expect(pane.scrollTop).toBe(100);
    await click('Follow output');
    expect(pane.scrollTop).toBe(2000);
    await click('Stop');
    expect(mocks.stop).toHaveBeenCalledOnce();
    await click('Back to repository');
    expect(mocks.back).toHaveBeenCalledOnce();
  });
  it('renders tool output as text and resets result navigation for a different run', async () => {
    const run = sampleRun();
    await render({
      ...run,
      output: [{ ...run.output[0], stream: 'stdout', text: '\u001b]8;;javascript:alert(1)\u0007<img src=x onerror=alert(1)>\u001b]8;;\u0007' }],
    });
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
    await click('Summary');
    await render({ ...run, runId: 'next', status: 'running' });
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Console');
  });
});
