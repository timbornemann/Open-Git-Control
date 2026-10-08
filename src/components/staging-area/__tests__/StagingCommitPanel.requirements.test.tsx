// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StagingCommitPanel } from '../StagingCommitPanel';
import { I18nProvider } from '@/i18n';

const openSettings = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useOpenSettingsGroup', () => ({ useOpenSettingsGroup: () => openSettings }));
type Props = ComponentProps<typeof StagingCommitPanel>;
describe('commit prerequisites', () => {
  let root: Root;
  let host: HTMLDivElement;
  let props: Props;
  const render = () => act(() => root.render(createElement(I18nProvider, { language: 'en' }, createElement(StagingCommitPanel, props))));
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.trim() === label)!;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    openSettings.mockClear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    props = {
      status: { staged: [], modified: [], untracked: [], deleted: [] },
      fileOps: { isMutating: false },
      commitForm: {
        commitMsg: '',
        commitDescription: '',
        isCommitting: false,
        amendCommit: false,
        signoffCommit: false,
        handleCommit: vi.fn(),
        setCommitMsg: vi.fn(),
        setCommitDescription: vi.fn(),
      },
      aiCommit: { aiGroups: [], isAiCommitting: false, isAiJobRunning: false, isAiMessageGenerating: false, handleAiAutoCommit: vi.fn() },
      hasOpenConflicts: false,
      isCommitInputDisabled: false,
      aiConfigEnabled: false,
      aiCommitMessageStyleLabel: 'Plain',
      openAiCommitMessageDialog: vi.fn(),
    } as unknown as Props;
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it('opens the auto-commit setting without enabling or running the action', () => {
    render();
    expect(host.textContent).toContain('AI auto-commit is turned off in settings.');
    act(() => button('Configure AI auto-commit').click());
    expect(openSettings).toHaveBeenCalledWith({ tab: 'api', id: 'ai-automation' });
    expect(props.aiCommit.handleAiAutoCommit).not.toHaveBeenCalled();
    expect(props.aiConfigEnabled).toBe(false);
  });
  it('keeps normal empty staging quiet, then offers one title link once there are staged changes', () => {
    props.aiConfigEnabled = true;
    render();
    expect(host.querySelector('.ui-action-requirement__help')).toBeNull();
    expect(button('Commit').disabled).toBe(true);
    props.status.staged = ['file.txt'];
    render();
    expect(host.textContent?.match(/Enter commit title/g)).toHaveLength(1);
    expect(host.textContent).not.toContain('Enter a commit title.');
    const commitButton = button('Commit');
    const titleLink = button('Enter commit title');
    const titleField = host.querySelector<HTMLTextAreaElement>('.staging-commit-input')!;
    expect(document.getElementById(commitButton.getAttribute('aria-describedby')!)!).toBe(titleLink);
    expect(document.getElementById(titleField.getAttribute('aria-describedby')!)).toBe(titleLink);
    expect(host.querySelector('.staging-commit-actions')?.textContent).not.toContain('Enter commit title');
    act(() => button('Enter commit title').click());
    expect(document.activeElement).toBe(titleField);
    expect(button('Commit').disabled).toBe(true);
    props.commitForm.commitMsg = 'Ready';
    render();
    expect(button('Commit').disabled).toBe(false);
    expect(button('Enter commit title')).toBeUndefined();
    props.status.staged = [];
    props.commitForm.commitMsg = '';
    render();
    expect(button('Enter commit title')).toBeUndefined();
    expect(button('Commit').disabled).toBe(true);
    expect(props.commitForm.handleCommit).not.toHaveBeenCalled();
  });
  it('still offers the title link when amending a commit without newly staged changes', () => {
    props.commitForm.amendCommit = true;
    render();
    act(() => button('Enter commit title').click());
    expect(document.activeElement).toBe(host.querySelector('.staging-commit-input'));
    props.commitForm.commitMsg = 'Corrected title';
    render();
    expect(button('Commit').disabled).toBe(false);
    expect(button('Enter commit title')).toBeUndefined();
    expect(props.commitForm.handleCommit).not.toHaveBeenCalled();
  });
  it('keeps conflict and running-operation protection', () => {
    props.hasOpenConflicts = true;
    render();
    expect(host.textContent).toContain('Resolve the open conflicts first.');
    expect(button('Conflicts').disabled).toBe(true);
    props.hasOpenConflicts = false;
    props.fileOps.isMutating = true;
    render();
    expect(button('Commit').disabled).toBe(true);
    expect(button('Configure AI auto-commit')).toBeUndefined();
  });
});
