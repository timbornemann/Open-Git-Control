// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type AppLanguage } from '@/i18n';
import { ItemDialog } from './PlannerDialogs';

const item = {
  id: 'item-1',
  projectId: 'project-1',
  title: 'Fix timeline parsing',
  description: 'Handle copied paths.',
  priority: 'high' as const,
  status: 'bug' as const,
  tags: ['git'],
  createdAt: 1,
  updatedAt: 1,
};

describe('ItemDialog', () => {
  let host: HTMLDivElement;
  let root: Root;

  const renderDialog = (props: Partial<ComponentProps<typeof ItemDialog>> = {}, language: AppLanguage = 'de') =>
    act(async () => {
      root.render(
        createElement(I18nProvider, {
          language,
          children: createElement(ItemDialog, { open: true, busy: false, onClose: vi.fn(), onSubmit: vi.fn(), ...props }),
        }),
      );
    });

  const tagsField = () => host.querySelector<HTMLInputElement>('input[placeholder="Bug, Feature, UI"]')!;
  const changeInput = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const changeStatus = (value: string) =>
    act(() => {
      const select = host.querySelectorAll('select')[1];
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  const submit = () => act(async () => host.querySelector<HTMLButtonElement>('.dialog-btn-primary')!.click());

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it.each([
    ['de', 'bug', 'Bug'],
    ['de', 'idea', 'Idee'],
    ['en', 'idea', 'Idea'],
  ] as const)('creates a %s item in %s with its category tag', async (language, defaultStatus, tag) => {
    const onSubmit = vi.fn();
    await renderDialog({ defaultStatus, onSubmit }, language);

    expect(tagsField().value).toBe(tag);
    changeInput(host.querySelector('input')!, 'New todo');
    await submit();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: defaultStatus, tags: [tag] }));
  });

  it('uses the category selected before creation and keeps custom tags without duplicating the category', async () => {
    const onSubmit = vi.fn();
    await renderDialog({ defaultStatus: 'idea', onSubmit });
    changeStatus('bug');
    expect(tagsField().value).toBe('Bug');
    changeInput(host.querySelector('input')!, 'New todo');
    changeInput(tagsField(), 'Bug, UI, geplant');
    changeStatus('planned');
    await submit();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'planned', tags: ['Geplant', 'UI'] }));
  });

  it.each([{ tags: ['Bug', 'UI'] }, { tags: [] }])('keeps existing tags $tags when editing and moving an item', async ({ tags }) => {
    const onSubmit = vi.fn();
    await renderDialog({ item: { ...item, tags }, onSubmit });
    changeStatus('in-progress');
    await submit();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'in-progress', tags }));
  });

  it('offers copy and AI commit actions for a repository todo', async () => {
    const onCopyAgentPrompt = vi.fn();
    const onGenerateCommitMessage = vi.fn();

    await act(async () => {
      root.render(
        createElement(ItemDialog, {
          open: true,
          item,
          busy: false,
          onClose: vi.fn(),
          onSubmit: vi.fn(),
          onCopyAgentPrompt,
          onGenerateCommitMessage,
        }),
      );
    });

    const buttons = Array.from(host.querySelectorAll('button'));
    const copyButton = buttons.find((button) => button.textContent?.includes('Agent-Prompt kopieren'));
    const commitButton = buttons.find((button) => button.textContent?.includes('KI-Commit-Nachricht'));
    expect(copyButton).toBeTruthy();
    expect(commitButton).toBeTruthy();

    act(() => copyButton?.click());
    expect(onCopyAgentPrompt).toHaveBeenCalledWith(expect.objectContaining({ title: item.title, description: item.description }));

    act(() => commitButton?.click());
    expect(onGenerateCommitMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: item.id, persistedStatus: item.status, title: item.title, description: item.description }),
    );
  });

  it('does not render the commit action when no repository action is supplied', async () => {
    await act(async () => {
      root.render(
        createElement(ItemDialog, {
          open: true,
          item,
          busy: false,
          onClose: vi.fn(),
          onSubmit: vi.fn(),
          onCopyAgentPrompt: vi.fn(),
        }),
      );
    });

    expect(host.textContent).toContain('Agent-Prompt kopieren');
    expect(host.textContent).not.toContain('KI-Commit-Nachricht');
  });
});
