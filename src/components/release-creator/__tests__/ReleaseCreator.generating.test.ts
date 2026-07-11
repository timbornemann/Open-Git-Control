import { JSDOM } from 'jsdom';
import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { ReleaseCreator } from '../ReleaseCreator';
import { DEFAULT_RELEASE_NOTES_OPTIONS } from '@/types/releaseNotes';
import { ReleaseMiniForm } from '@/components/layout/sidebar/ReleaseMiniForm';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const createReleaseCreatorProps = (overrides: Partial<ComponentProps<typeof ReleaseCreator>> = {}): ComponentProps<typeof ReleaseCreator> => ({
  ownerRepo: { owner: 'octo', repo: 'repo' },
  releaseForm: {
    owner: 'octo',
    repo: 'repo',
    tagName: 'v1.2.3',
    targetCommitish: 'main',
    releaseName: 'Release v1.2.3',
    body: 'notes',
    draft: false,
    prerelease: false,
  },
  setReleaseForm: vi.fn(),
  releaseSubmitting: false,
  releaseError: null,
  releaseSuccess: null,
  onCreateRelease: vi.fn(),
  pendingAssets: [],
  onAddPendingAssets: vi.fn(),
  onRemovePendingAsset: vi.fn(),
  contextLoading: false,
  contextError: null,
  context: {
    existingTags: ['v1.2.2'],
    lastReleaseTag: 'v1.2.2',
    repositoryHtmlUrl: 'https://github.com/octo/repo',
    commitsSinceLastRelease: [{ hash: 'a'.repeat(40), shortHash: 'aaaaaaa', subject: 'change', author: 'A', date: '2026-01-01' }],
    commitsTarget: 'main',
    fallbackUsed: false,
  },
  onRefreshContext: vi.fn(),
  onGenerateNotes: vi.fn(),
  notesGenerating: false,
  notesLanguage: 'en',
  setNotesLanguage: vi.fn(),
  notesOptions: DEFAULT_RELEASE_NOTES_OPTIONS,
  setNotesOptions: vi.fn(),
  ...overrides,
});

describe('ReleaseCreator while AI notes are generating', () => {
  it('disables publishing and editing until generation finishes', async () => {
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(createElement(I18nProvider, { language: 'en' }, createElement(ReleaseCreator, createReleaseCreatorProps({ notesGenerating: true }))));
    });

    expect((document.querySelector('.release-primary-btn') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('.release-textarea--editor') as HTMLTextAreaElement).disabled).toBe(true);
    expect((document.querySelector('.release-history-toolbar .staging-tool-btn') as HTMLButtonElement).disabled).toBe(true);
    act(() => root.unmount());
  });

  it('does not publish or generate notes from loading or mismatched release context', async () => {
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(createElement(I18nProvider, { language: 'en' }, createElement(ReleaseCreator, createReleaseCreatorProps({ contextLoading: true }))));
    });
    expect((document.querySelector('.release-primary-btn') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('.release-ai-generate-btn') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          { language: 'en' },
          createElement(
            ReleaseCreator,
            createReleaseCreatorProps({
              context: { ...createReleaseCreatorProps().context!, commitsTarget: 'develop' },
            }),
          ),
        ),
      );
    });
    expect((document.querySelector('.release-primary-btn') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector('.release-ai-generate-btn') as HTMLButtonElement).disabled).toBe(true);
    act(() => root.unmount());
  });

  it('also locks the sidebar release form so a late AI answer cannot overwrite concurrent edits', async () => {
    const root = createRoot(document.getElementById('root')!);
    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          { language: 'en' },
          createElement(ReleaseMiniForm, {
            ownerRepo: { owner: 'octo', repo: 'repo' },
            releaseForm: {
              owner: 'octo',
              repo: 'repo',
              tagName: 'v1.2.3',
              targetCommitish: 'main',
              releaseName: 'Release v1.2.3',
              body: 'notes',
              draft: false,
              prerelease: false,
            },
            setReleaseForm: vi.fn(),
            releaseSubmitting: false,
            releaseNotesGenerating: true,
            releaseError: null,
            releaseSuccess: null,
            onCreateRelease: vi.fn(),
            onOpenUrl: vi.fn(),
          }),
        ),
      );
    });

    expect(Array.from(document.querySelectorAll('input, textarea, button')).every((node) => (node as HTMLInputElement).disabled)).toBe(true);
    act(() => root.unmount());
  });
});
