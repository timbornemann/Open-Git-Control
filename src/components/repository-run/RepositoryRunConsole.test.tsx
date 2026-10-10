// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { sampleRun } from '@/utils/__tests__/repositoryRunFixture';
import { RepositoryRunConsole } from './RepositoryRunConsole';
import type { RepositoryRunFileLinkProps } from './RepositoryRunLinkedText';

const mocks = vi.hoisted(() => ({ copy: vi.fn(), toast: vi.fn(), stop: vi.fn(), back: vi.fn(), openFile: vi.fn() }));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: mocks.copy }));
vi.mock('@/contexts/AppStateContext', () => ({ useRepositoryContext: () => ({ onToast: mocks.toast }) }));
let host: HTMLDivElement, root: Root;
const render = (run = sampleRun(), onOpenFile?: RepositoryRunFileLinkProps['onOpenFile']) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
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
  mocks.copy.mockResolvedValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('repository run console presentation', () => {
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
