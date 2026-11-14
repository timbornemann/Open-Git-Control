// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { PushTransferReview } from './PushTransferReview';
import type { SecretScanFindingDto } from '@/types/gitDtos';

vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en }) }));

let root: Root;
let container: HTMLDivElement;
let props: ComponentProps<typeof PushTransferReview>;
const finding: SecretScanFindingDto = {
  id: 'test-finding',
  filePath: 'tests/fixtures/tokens.ts',
  lineNumber: 42,
  ruleId: 'github-fine-grained-pat',
  severity: 'critical',
  source: 'to-push',
  contextLine: "const exampleToken = '[REDACTED]';",
};
const target = { id: 'origin', remoteName: 'origin', url: 'https://example.test/repo.git', destinationRef: 'refs/heads/main', sourceOid: 'a'.repeat(40) };
async function render() {
  await act(async () => root.render(createElement(PushTransferReview, props)));
}
function button(label: string) {
  const result = [...container.querySelectorAll('button')].find((element) => element.textContent === label);
  expect(result, label).toBeDefined();
  return result!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  props = {
    plan: {
      id: 'plan',
      repoPath: '/repo',
      sourceOid: target.sourceOid,
      branch: 'main',
      tagNames: [],
      force: false,
      secretScanArgs: ['origin'],
      targets: [target],
    },
    scan: { scanned: true, strictness: 'low', findings: [finding], notes: [], stats: { checkedLines: 8, stagedLines: 0, toPushLines: 8, tagLines: 0 } },
    batch: null,
    reviewingRetry: false,
    force: false,
    busy: false,
    executePush: vi.fn(),
    retryScan: vi.fn(),
    allowlistAndRescan: vi.fn(),
    openAllowlist: vi.fn(),
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('secret scan push review', () => {
  it('groups findings by file and shows line, source, risk and redacted context', async () => {
    props.scan!.findings = [
      finding,
      { ...finding, id: 'earlier', lineNumber: 7, source: 'tag', ruleId: 'private-key-block', contextLine: '[REDACTED_SECRET]' },
      { ...finding, id: 'other-file', filePath: 'config/example.env', source: 'staged', severity: 'medium' },
    ];
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('3 possible secrets in 2 files');
    expect(container.querySelectorAll('.secret-scan-file')).toHaveLength(2);
    const file = container.querySelector('.secret-scan-file')!;
    expect(file.querySelector('.secret-scan-file__header')?.textContent).toContain('tests/fixtures/tokens.ts');
    expect(file.querySelector('.secret-scan-finding__location')?.textContent).toContain('Line 7');
    expect(file.textContent).toContain('Outgoing commit history');
    expect(file.textContent).toContain('Tag history');
    expect(file.textContent).toContain('Risk: Critical');
    expect(file.textContent).toContain('GitHub Token (fine-grained)');
    expect(container.textContent).toContain('Index · staged for commit');
    expect(container.querySelectorAll('.secret-scan-finding__mask')).toHaveLength(3);
    expect(button('Allowlist 2 files & push')).toBeDefined();
    expect(file.textContent).toContain("const exampleToken = '••• Secret hidden •••';");
    expect(props.executePush).not.toHaveBeenCalled();
    expect(props.allowlistAndRescan).not.toHaveBeenCalled();
  });

  it('never renders unredacted or missing context as a preview', async () => {
    props.scan!.findings = [
      { ...finding, contextLine: 'synthetic-test-value-without-redaction' },
      { ...finding, id: 'empty', contextLine: '' },
    ];
    await render();
    expect(container.innerHTML).not.toContain('synthetic-test-value-without-redaction');
    expect(container.querySelectorAll('.secret-scan-finding__unavailable')).toHaveLength(2);
  });

  it('keeps the mask visible in long context and renders code as text', async () => {
    props.scan!.findings = [{ ...finding, contextLine: `${'long-prefix-'.repeat(400)}<img src=x onerror=alert(1)> = [REDACTED_SECRET]; trailing context` }];
    await render();
    const context = container.querySelector('.secret-scan-finding__context')!;
    expect(context.textContent).toContain('••• Secret hidden •••');
    expect(context.textContent).toContain('trailing context');
    expect(context.textContent!.length).toBeLessThan(300);
    expect(context.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(context.querySelector('img')).toBeNull();
  });

  it('hides the full private-key line when an older preview only redacted the PEM header', async () => {
    props.scan!.findings = [
      { ...finding, ruleId: 'private-key-block', contextLine: '[REDACTED_SECRET]\\nsynthetic-private-key-body\\n-----END PRIVATE KEY-----' },
    ];
    await render();
    expect(container.innerHTML).not.toContain('synthetic-private-key-body');
    expect(container.textContent).toContain('Private key');
    expect(container.querySelector('.secret-scan-finding__context')?.textContent).toContain('••• Secret hidden •••');
  });

  it('explains permanent file exceptions and keeps the actions independent', async () => {
    await render();
    expect(container.textContent).toContain('permanently excludes entire files');
    expect(container.textContent).toContain('Rechecks and pushes if no further matches are found');
    await click('Edit allowlist');
    expect(props.openAllowlist).toHaveBeenCalledOnce();
    expect(props.allowlistAndRescan).not.toHaveBeenCalled();
    expect(props.executePush).not.toHaveBeenCalled();
    await click('Allowlist 1 file & push');
    expect(props.allowlistAndRescan).toHaveBeenCalledOnce();
    expect(props.executePush).not.toHaveBeenCalled();
    await click('Push anyway');
    expect(props.executePush).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('retains the separate force confirmation after adding exceptions', async () => {
    props.force = true;
    await render();
    expect(container.textContent).toContain('Then recheck and confirm force with lease');
    await click('Allowlist 1 file & recheck');
    expect(props.allowlistAndRescan).toHaveBeenCalledOnce();
    expect(props.executePush).not.toHaveBeenCalled();
    await click('Confirm force with lease anyway');
    expect(props.executePush).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('blocks bypass and file exceptions until the full history can be checked', async () => {
    props.scan!.historyScanIncomplete = true;
    props.scan!.notes = ['History could not be read.'];
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('full push history must be checked');
    expect(button('Push anyway').disabled).toBe(true);
    expect(button('Allowlist 1 file & push').disabled).toBe(true);
    await click('Push anyway');
    await click('Allowlist 1 file & push');
    expect(props.executePush).not.toHaveBeenCalled();
    expect(props.allowlistAndRescan).not.toHaveBeenCalled();
    await click('Retry check');
    expect(props.retryScan).toHaveBeenCalledOnce();
    expect(container.querySelector('.push-secret-review__details')?.textContent).toContain('History could not be read.');
  });

  it('disables all scan actions while an operation is running', async () => {
    props.busy = true;
    props.scan!.historyScanIncomplete = true;
    await render();
    expect([...container.querySelectorAll('button')].every((element) => element.disabled)).toBe(true);
  });

  it('shows only remaining targets on a retry without claiming earlier pushes were stopped', async () => {
    const completed = { ...target, id: 'backup', remoteName: 'backup' };
    props.plan.targets.push(completed);
    props.reviewingRetry = true;
    props.batch = {
      id: 'batch',
      planId: 'plan',
      repoPath: '/repo',
      sourceOid: target.sourceOid,
      state: 'partial',
      targets: [
        { ...target, status: 'failed', message: '' },
        { ...completed, status: 'success', message: '' },
      ],
    };
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('remaining push targets');
    expect(container.textContent).not.toContain('Nothing has been pushed yet');
    const targets = container.querySelector('.push-secret-review__plan')!;
    expect(targets.textContent).toContain('origin');
    expect(targets.textContent).not.toContain('backup');
  });

  it('keeps a force review without findings on the normal push path', async () => {
    props.scan!.findings = [];
    props.force = true;
    await render();
    expect(container.querySelector('.push-secret-review')).toBeNull();
    await click('Confirm force with lease');
    expect(props.executePush).toHaveBeenCalledExactlyOnceWith(false);
  });
});
