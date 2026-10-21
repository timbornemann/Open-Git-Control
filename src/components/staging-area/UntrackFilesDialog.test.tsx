// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { UntrackFilesInspection, UntrackScope } from '@/shared/ipc/untrackFiles';
import { UntrackFilesDialog } from './UntrackFilesDialog';
import { useUntrackFiles } from './useUntrackFiles';

const preview = (scope: UntrackScope = 'file', planId = 'plan'): UntrackFilesInspection => ({
  planId,
  expiresAt: Date.now() + 900_000,
  scope,
  scopes: [
    { kind: 'file', value: 'logs/a.log' },
    { kind: 'directory', value: 'logs' },
    { kind: 'extension', value: '.log' },
  ],
  candidates:
    scope === 'file'
      ? [{ id: 'a', path: 'logs/a.log', ignored: false, added: false }]
      : [
          { id: 'a', path: 'logs/a.log', ignored: false, added: false },
          { id: 'b', path: 'logs/b.log', ignored: true, added: true },
          { id: 'blocked', path: 'logs/unsafe.log', ignored: true, added: false, blocked: 'indexOnly' },
        ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('untracking preview and confirmation', () => {
  let host: HTMLDivElement;
  let root: Root;
  let model: ReturnType<typeof useUntrackFiles>;
  let repo: string;
  let canExecute: boolean;
  let language: 'de' | 'en';
  let onChanged: ReturnType<typeof vi.fn<() => Promise<void>>>;
  const Harness = () => {
    model = useUntrackFiles({ repoPath: repo, canExecute, onChanged });
    return (
      <>
        <button onClick={() => model.open('logs/a.log')}>open</button>
        <UntrackFilesDialog model={model} />
      </>
    );
  };
  const render = () =>
    act(() =>
      root.render(
        <I18nProvider language={language}>
          <Harness />
        </I18nProvider>,
      ),
    );
  const click = async (text: string) => {
    const button = Array.from(host.querySelectorAll('button')).find((element) => element.textContent?.includes(text));
    if (!button) throw new Error(`Button not found: ${text}`);
    await act(async () => button.click());
  };
  const changeScope = async (scope: UntrackScope) => {
    const select = host.querySelector('select')!;
    await act(async () => {
      select.value = scope;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const input = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    repo = 'C:/repo';
    canExecute = true;
    language = 'de';
    onChanged = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(gitClient, 'onJobEvent').mockReturnValue(() => {});
    vi.spyOn(gitClient, 'cancelUntrackFiles').mockResolvedValue(true);
    vi.spyOn(gitClient, 'inspectUntrackFiles').mockImplementation(async (request) => ({ success: true, data: preview(request.scope) }));
    vi.spyOn(gitClient, 'executeUntrackFiles').mockResolvedValue({ success: true, data: { status: 'applied', paths: ['logs/a.log'] } });
    render();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('opens immediately while inspection is pending, and ignores results after Escape', async () => {
    const pending = deferred<Awaited<ReturnType<typeof gitClient.inspectUntrackFiles>>>();
    vi.mocked(gitClient.inspectUntrackFiles).mockReturnValue(pending.promise);
    await click('open');
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.textContent).toContain('Versionierte Dateien, Ignorierregeln und Inhalte prüfen');
    expect(host.querySelector('select')).toBeNull();
    const operationId = vi.mocked(gitClient.inspectUntrackFiles).mock.calls[0][0].operationId;
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(gitClient.cancelUntrackFiles).toHaveBeenCalledWith(operationId);
    await act(async () => pending.resolve({ success: true, data: preview() }));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(gitClient.executeUntrackFiles).not.toHaveBeenCalled();
  });
  it('preselects a safe single nonignored file and explains its staged deletion', async () => {
    await click('open');
    expect(input('logs/a.log').checked).toBe(true);
    expect(host.textContent).toContain('1 bereits committete Dateien: Entfernung wird gestagt');
    expect(host.textContent).toContain('nicht ignoriert und können danach erneut gestagt werden');
    await click('1 Dateien aus Versionierung entfernen');
    expect(gitClient.executeUntrackFiles).toHaveBeenCalledWith(expect.objectContaining({ repoPath: repo, planId: 'plan', selectedIds: ['a'] }));
    expect(onChanged).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Lokale Inhalte wurden beibehalten');
    expect(host.querySelector('select')).toBeNull();
  });
  it('preselects only ignored eligible bulk matches and allows explicit nonignored selection', async () => {
    await click('open');
    await changeScope('directory');
    expect(input('logs/a.log').checked).toBe(false);
    expect(input('logs/b.log').checked).toBe(true);
    expect(input('logs/unsafe.log').checked).toBe(false);
    expect(input('logs/unsafe.log').disabled).toBe(true);
    expect(host.textContent).toContain('Nur gestagt vorhandener Inhalt');
    await act(async () => input('logs/a.log').click());
    expect(host.textContent).toContain('2 von 3 Dateien ausgewählt');
    expect(host.textContent).toContain('1 neu gestagte Dateien');
    await click('2 Dateien aus Versionierung entfernen');
    expect(gitClient.executeUntrackFiles).toHaveBeenCalledWith(expect.objectContaining({ selectedIds: ['b', 'a'] }));
  });
  it('discards earlier selections when the scope or inspected revision changes', async () => {
    await click('open');
    await changeScope('directory');
    await act(async () => input('logs/a.log').click());
    await changeScope('extension');
    expect(input('logs/a.log').checked).toBe(false);
    expect(input('logs/b.log').checked).toBe(true);
    await click('Erneut prüfen');
    expect(vi.mocked(gitClient.inspectUntrackFiles).mock.calls.map((call) => call[0].scope)).toEqual(['file', 'directory', 'extension', 'extension']);
    expect(input('logs/a.log').checked).toBe(false);
  });
  it('clears a stale preview and requires a new explicit selection without retrying execution', async () => {
    vi.mocked(gitClient.executeUntrackFiles).mockResolvedValue({ success: true, data: { status: 'stale', reason: 'files' } });
    await click('open');
    await click('1 Dateien aus Versionierung entfernen');
    expect(host.textContent).toContain('Die Vorschau ist nicht mehr aktuell');
    expect(model.selected.size).toBe(0);
    expect(gitClient.inspectUntrackFiles).toHaveBeenCalledOnce();
    await click('Erneut prüfen');
    expect(gitClient.inspectUntrackFiles).toHaveBeenCalledTimes(2);
    expect(gitClient.executeUntrackFiles).toHaveBeenCalledOnce();
  });
  it('keeps the modal during execution, blocks repeat clicks and reports completion after a late cancel', async () => {
    const pending = deferred<Awaited<ReturnType<typeof gitClient.executeUntrackFiles>>>();
    vi.mocked(gitClient.executeUntrackFiles).mockReturnValue(pending.promise);
    await click('open');
    await click('1 Dateien aus Versionierung entfernen');
    expect(input('logs/a.log').disabled).toBe(true);
    expect(host.querySelector('select')?.disabled).toBe(true);
    await click('1 Dateien aus Versionierung entfernen');
    expect(gitClient.executeUntrackFiles).toHaveBeenCalledOnce();
    await click('Abbrechen');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain('Abbruch und tatsächlichen Zustand prüfen');
    await act(async () => pending.resolve({ success: true, data: { status: 'applied', paths: ['logs/a.log'] } }));
    expect(host.textContent).toContain('1 Dateien aus der Versionierung entfernt');
    expect(onChanged).toHaveBeenCalledOnce();
  });
  it('preserves the completed result if refreshing the rest of the UI fails', async () => {
    onChanged.mockRejectedValue(new Error('refresh unavailable'));
    await click('open');
    await click('1 Dateien aus Versionierung entfernen');
    expect(host.textContent).toContain('Lokale Inhalte wurden beibehalten');
    expect(host.textContent).toContain('Die Ansicht konnte nicht aktualisiert werden');
    expect(gitClient.executeUntrackFiles).toHaveBeenCalledOnce();
  });
  it('supports keyboard navigation into virtualized rows and selection with native controls', async () => {
    const many = {
      ...preview('directory'),
      candidates: Array.from({ length: 60 }, (_, index) => ({ id: String(index), path: `logs/${index}.log`, ignored: true, added: false })),
    };
    vi.mocked(gitClient.inspectUntrackFiles).mockResolvedValue({ success: true, data: many });
    await click('open');
    input('logs/0.log').focus();
    act(() => input('logs/0.log').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(input('logs/59.log'));
    expect(input('logs/59.log').type).toBe('checkbox');
    await act(async () => input('logs/59.log').click());
    expect(model.selected.size).toBe(59);
  });
  it('closes and cancels on a repository switch without applying a late result to the new repository', async () => {
    const pending = deferred<Awaited<ReturnType<typeof gitClient.executeUntrackFiles>>>();
    vi.mocked(gitClient.executeUntrackFiles).mockReturnValue(pending.promise);
    await click('open');
    await click('1 Dateien aus Versionierung entfernen');
    repo = 'C:/different';
    render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => pending.resolve({ success: true, data: { status: 'applied', paths: ['logs/a.log'] } }));
    expect(onChanged).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('renders English and communicates inspection errors with a retry action', async () => {
    language = 'en';
    render();
    vi.mocked(gitClient.inspectUntrackFiles).mockResolvedValueOnce({ success: false, error: 'Index unavailable' });
    await click('open');
    expect(host.textContent).toContain('Stop tracking files');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Index unavailable');
    await click('Inspect again');
    expect(host.textContent).toContain('1 of 1 files selected');
  });
  it('does not restore a virtual-list focus request from an older preview', async () => {
    const many = {
      ...preview('directory'),
      candidates: Array.from({ length: 60 }, (_, index) => ({ id: String(index), path: `logs/${index}.log`, ignored: true, added: false })),
    };
    vi.mocked(gitClient.inspectUntrackFiles)
      .mockResolvedValueOnce({ success: true, data: many })
      .mockResolvedValueOnce({ success: true, data: { ...many, planId: 'new-plan' } });
    await click('open');
    input('logs/0.log').focus();
    act(() => input('logs/0.log').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(input('logs/59.log'));
    await click('Erneut prüfen');
    expect(document.activeElement?.getAttribute('aria-label')).not.toBe('logs/59.log');
  });
  it('explains an aborted operation in the selected language without reporting completion', async () => {
    vi.mocked(gitClient.executeUntrackFiles).mockResolvedValue({ success: false, error: 'Git operation was aborted.' });
    await click('open');
    await click('1 Dateien aus Versionierung entfernen');
    expect(host.textContent).toContain('Abgebrochen. Die Entfernung wurde nicht übernommen.');
    expect(onChanged).not.toHaveBeenCalled();
  });
  it('does not open while another staging mutation is running', async () => {
    canExecute = false;
    render();
    await click('open');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(gitClient.inspectUntrackFiles).not.toHaveBeenCalled();
  });
});
