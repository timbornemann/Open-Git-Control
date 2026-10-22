// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { CommitFileDetail } from '@/utils/gitParsing';
import { CommitFileTree } from './CommitFileTree';

let root: Root, host: HTMLDivElement;
const onSelectFile = vi.fn();
const row = (key: string) => [...host.querySelectorAll<HTMLButtonElement>('[data-node-key]')].find((button) => button.dataset.nodeKey === key);

function Harness({ files, language = 'en' }: { files: CommitFileDetail[]; language?: 'de' | 'en' }) {
  const [collapsedPaths, setCollapsedPaths] = useState(new Set<string>());
  return (
    <I18nProvider language={language}>
      <CommitFileTree
        repoPath="C:/repos/project"
        files={files}
        collapsedPaths={collapsedPaths}
        onSelectFile={onSelectFile}
        onToggleDirectory={(path) =>
          setCollapsedPaths((current) => {
            const next = new Set(current);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
          })
        }
      />
    </I18nProvider>
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onSelectFile.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('CommitFileTree', () => {
  it('shows compact expanded folders and preserves status colors and paths on selection', async () => {
    const files = [
      { status: 'A', path: 'src/added.ts' },
      { status: 'M', path: 'src/modified.ts' },
      { status: 'D', path: 'src/deleted.ts' },
      { status: 'R100', path: 'src/renamed.ts', oldPath: 'old/file.ts' },
    ];
    await act(async () => root.render(<Harness files={files} />));
    expect(host.querySelector('.working-tree-root__label')?.textContent).toBe('project/');
    expect(row('directory:src')?.getAttribute('aria-expanded')).toBe('true');
    for (const [index, color] of [
      [0, 'success'],
      [1, 'warning'],
      [2, 'danger'],
      [3, 'untracked'],
    ] as const) {
      const button = row(`file:${files[index].path}`)!;
      expect(button.querySelector('svg')?.getAttribute('stroke')).toBe(`var(--status-${color})`);
      expect(button.querySelector('.working-tree-row__label')?.textContent).toBe(files[index].path.split('/').at(-1));
      act(() => button.click());
      expect(onSelectFile).toHaveBeenLastCalledWith(files[index]);
    }
    expect(row('file:src/renamed.ts')?.title).toBe('old/file.ts → src/renamed.ts');
    expect(row('file:src/deleted.ts')?.getAttribute('aria-label')).toContain('Deleted');
    act(() => row('directory:src')!.click());
    expect(row('directory:src')?.getAttribute('aria-expanded')).toBe('false');
    expect(row('file:src/added.ts')).toBeUndefined();
    expect(onSelectFile).toHaveBeenCalledTimes(4);
    act(() => row('directory:src')!.click());
    expect(row('file:src/deleted.ts')).toBeDefined();
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it('labels paths, renames and expansion controls in German', async () => {
    const file = { status: 'R100', path: 'Ziel/a\tb\nc\\d 😀.ts', oldPath: 'Alt/datei.ts' };
    await act(async () => root.render(<Harness files={[file]} language="de" />));
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Geänderte Dateien');
    expect(row('directory:Ziel')?.getAttribute('aria-label')).toBe('Ziel');
    expect(row(`file:${file.path}`)?.getAttribute('aria-label')).toContain('Umbenannt');
    act(() => row(`file:${file.path}`)!.click());
    expect(onSelectFile).toHaveBeenCalledExactlyOnceWith(file);
  });

  it('virtualizes thousands of changed files and can select a distant entry', async () => {
    const files = Array.from({ length: 5000 }, (_, index) => ({ status: 'M', path: `src/file-${String(index).padStart(5, '0')}.ts` }));
    await act(async () => root.render(<Harness files={files} />));
    expect(host.querySelectorAll('[data-node-key]').length).toBeLessThan(100);
    expect(row('file:src/file-04000.ts')).toBeUndefined();
    const list = host.querySelector<HTMLElement>('.working-tree-list')!;
    act(() => {
      list.scrollTop = 4001 * 25;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    act(() => row('file:src/file-04000.ts')!.click());
    expect(onSelectFile).toHaveBeenCalledExactlyOnceWith(files[4000]);
    expect(host.querySelectorAll('[data-node-key]').length).toBeLessThan(100);
  });

  it('moves Tab focus through unmounted rows and lets keyboard users leave the list at its boundaries', async () => {
    const files = Array.from({ length: 70 }, (_, index) => ({ status: 'A', path: `file-${String(index).padStart(3, '0')}.ts` }));
    await act(async () => root.render(<Harness files={files} />));
    act(() => row('file:file-000.ts')!.focus());
    const tab = async (shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      await act(async () => document.activeElement!.dispatchEvent(event));
      return event;
    };
    expect((await tab(true)).defaultPrevented).toBe(false);
    for (let index = 1; index < files.length; index++) {
      expect((await tab()).defaultPrevented).toBe(true);
      expect((document.activeElement as HTMLButtonElement).dataset.nodeKey).toBe(`file:${files[index].path}`);
    }
    expect((await tab()).defaultPrevented).toBe(false);
    await tab(true);
    expect((document.activeElement as HTMLButtonElement).dataset.nodeKey).toBe('file:file-068.ts');
    expect(host.querySelectorAll('[data-node-key]').length).toBeLessThan(40);
  });
});
