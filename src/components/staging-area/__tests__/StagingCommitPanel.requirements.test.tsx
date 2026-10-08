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
  it('explains missing title and staged content, then removes the help once ready', () => {
    render();
    act(() => button('Enter commit title').click());
    expect(document.activeElement).toBe(host.querySelector('.staging-commit-input'));
    expect(button('Commit').disabled).toBe(true);
    props.commitForm.commitMsg = 'Ready';
    render();
    expect(host.textContent).toContain('Stage the changes for this commit first.');
    props.status.staged = ['file.txt'];
    render();
    expect(button('Commit').disabled).toBe(false);
    expect(host.textContent).not.toContain('Stage the changes');
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
