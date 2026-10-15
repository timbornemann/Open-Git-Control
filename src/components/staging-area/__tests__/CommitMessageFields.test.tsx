// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { StagingCommitPanel } from '../StagingCommitPanel';
import { clearCommitFormDraftsForTests } from '../commitFormDraft';
import { useCommitForm } from '../useCommitForm';

describe('structured staging commit form', () => {
  let host: HTMLDivElement, root: Root;
  let repoPath: string, template: string;
  let current: ReturnType<typeof useCommitForm>;
  const toast = vi.fn();
  const status = { staged: [{ path: 'file.ts', x: 'M', y: ' ' }], unstaged: [], untracked: [], conflicts: [] };
  const Harness = () => {
    current = useCommitForm({
      repoPath,
      status,
      settings: { ...DEFAULT_SETTINGS, commitTemplate: template, secretScanBeforeCommitEnabled: false },
      setToast: toast,
      refresh: vi.fn().mockResolvedValue(undefined),
      setConfirmDialog: vi.fn(),
      onUpdateSettings: vi.fn(),
    });
    return createElement(StagingCommitPanel, {
      status,
      commitForm: current,
      fileOps: { isMutating: false } as never,
      aiCommit: { aiGroups: [], isAiCommitting: false, isAiJobRunning: false } as never,
      hasOpenConflicts: false,
      isCommitInputDisabled: current.isCommitting,
      aiConfigEnabled: true,
      aiCommitMessageStyleLabel: 'Conventional',
      openAiCommitMessageDialog: vi.fn(),
    });
  };
  const render = () => act(() => root.render(createElement(I18nProvider, { language: 'en' }, createElement(Harness))));
  const typeField = () => host.querySelector<HTMLSelectElement>('select')!;
  const scopeField = () => host.querySelector<HTMLInputElement>('input[id$="-scope"]')!;
  const messageField = () => host.querySelector<HTMLTextAreaElement>('textarea[id$="-message"]')!;
  const descriptionField = () => host.querySelector<HTMLTextAreaElement>('textarea[id$="-description"]')!;
  const commitButton = () => host.querySelector<HTMLButtonElement>('.staging-commit-btn')!;
  const fill = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    act(() => {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const chooseType = (value: string) =>
    act(() => {
      typeField().value = value;
      typeField().dispatchEvent(new Event('change', { bubbles: true }));
    });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    clearCommitFormDraftsForTests();
    toast.mockClear();
    repoPath = 'C:/repos/one';
    template = '';
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    vi.spyOn(gitClient, 'ensureCommitIdentity').mockResolvedValue(true);
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: 'refactor(core): extract cache\n\nKeep behavior.' });
    vi.spyOn(gitClient, 'createCommit').mockResolvedValue({ success: true });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('commits a plain message with an optional unparenthesized prefix, then clears all fields', async () => {
    render();
    expect(typeField().value).toBe('');
    expect(commitButton().disabled).toBe(true);
    fill(messageField(), 'improve startup');
    expect(host.querySelector('.staging-commit-preview')).toBeNull();
    fill(scopeField(), 'Quick note:');
    expect(host.querySelector('.staging-commit-preview')?.textContent).toContain('Quick note: improve startup');
    fill(scopeField(), '   ');
    expect(host.querySelector('.staging-commit-preview')).toBeNull();
    fill(scopeField(), 'Quick note:');
    fill(descriptionField(), 'First detail.\nSecond detail.');
    expect(host.querySelector('.staging-commit-preview')?.textContent).toContain('Quick note: improve startup');
    await act(async () => commitButton().click());
    expect(gitClient.createCommit).toHaveBeenCalledWith({
      repoPath,
      title: 'Quick note: improve startup',
      description: 'First detail.\nSecond detail.',
      amend: false,
      signoff: false,
    });
    expect([typeField().value, scopeField().value, messageField().value, descriptionField().value]).toEqual(['', '', '', '']);
    expect(commitButton().disabled).toBe(true);
  });

  it('requires a message for a selected type, formats the scope, and supports the commit shortcut', async () => {
    render();
    chooseType('fix');
    fill(scopeField(), 'backend');
    expect(commitButton().disabled).toBe(true);
    await act(async () => {
      messageField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    expect(gitClient.createCommit).not.toHaveBeenCalled();
    fill(messageField(), 'repair login');
    fill(scopeField(), '');
    expect(host.querySelector('.staging-commit-preview')?.textContent).toContain('fix: repair login');
    fill(scopeField(), 'backend');
    fill(descriptionField(), 'Keep the session alive.');
    expect(host.querySelector('.staging-commit-preview')?.textContent).toContain('fix(backend): repair login');
    await act(async () => {
      descriptionField().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    });
    expect(gitClient.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'fix(backend): repair login', description: 'Keep the session alive.' }),
    );
    expect([typeField().value, scopeField().value, messageField().value, descriptionField().value]).toEqual(['', '', '', '']);
  });

  it('keeps the full draft after a failed commit', async () => {
    vi.mocked(gitClient.createCommit).mockResolvedValue({ success: false, error: 'Commit hook rejected.' });
    render();
    chooseType('perf');
    fill(scopeField(), 'graph');
    fill(messageField(), 'reuse layout');
    fill(descriptionField(), 'Keep positions.');
    await act(async () => commitButton().click());
    expect([typeField().value, scopeField().value, messageField().value, descriptionField().value]).toEqual([
      'perf',
      'graph',
      'reuse layout',
      'Keep positions.',
    ]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
  });

  it('restores unfinished structured drafts per repository and across remounts', () => {
    render();
    chooseType('docs');
    fill(scopeField(), 'api');
    repoPath = 'C:/repos/two';
    render();
    expect([typeField().value, scopeField().value, messageField().value]).toEqual(['', '', '']);
    fill(messageField(), 'Draft in two');
    repoPath = 'C:/repos/one';
    render();
    expect([typeField().value, scopeField().value, messageField().value]).toEqual(['docs', 'api', '']);
    act(() => root.unmount());
    root = createRoot(host);
    render();
    expect([typeField().value, scopeField().value, messageField().value]).toEqual(['docs', 'api', '']);
  });

  it('imports generated conventional messages and replaces old metadata for plain messages', () => {
    render();
    act(() => {
      current.setCommitMsg('docs(api): document endpoints');
      current.setCommitDescription('Generated details.');
    });
    expect([typeField().value, scopeField().value, messageField().value, descriptionField().value]).toEqual([
      'docs',
      'api',
      'document endpoints',
      'Generated details.',
    ]);
    act(() => current.setCommitMsg('ordinary commit message'));
    expect([typeField().value, scopeField().value, messageField().value]).toEqual(['', '', 'ordinary commit message']);
  });

  it('prefills amend with the original type, scope, message and body', async () => {
    render();
    await act(async () => current.setAmendCommit(true));
    expect([typeField().value, scopeField().value, messageField().value, descriptionField().value]).toEqual([
      'refactor',
      'core',
      'extract cache',
      'Keep behavior.',
    ]);
  });

  it('starts with a configured template but leaves everything empty after a successful commit', async () => {
    template = 'fix(api): template message';
    render();
    expect([typeField().value, scopeField().value, messageField().value]).toEqual(['fix', 'api', 'template message']);
    await act(async () => commitButton().click());
    act(() => root.unmount());
    root = createRoot(host);
    render();
    expect([typeField().value, scopeField().value, messageField().value, descriptionField().value]).toEqual(['', '', '', '']);
  });
});
