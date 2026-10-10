// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { MergeBranchMenu } from './MergeBranchMenu';
import type { BranchInfo } from '@/types/git';

const branches: BranchInfo[] = [
  { name: 'feature', isHead: true, scope: 'local' },
  { name: 'main', isHead: false, scope: 'local' },
  { name: 'remotes/origin/main', isHead: false, scope: 'remote' },
];
let root: Root, host: HTMLDivElement;
const merge = vi.fn();
function render(currentBranch = 'feature', available = branches) {
  act(() =>
    root.render(
      createElement(I18nProvider, { language: 'en', children: createElement(MergeBranchMenu, { branches: available, currentBranch, onMerge: merge }) }),
    ),
  );
}
function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === text)!;
  act(() => button.click());
}
function select(index: number, value: string) {
  act(() => {
    const element = host.querySelectorAll('select')[index];
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  merge.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('guided topbar merge menu', () => {
  it('explains the default direction and submits only after a source is selected', () => {
    render();
    expect(host.textContent).toContain('Your current branch stays active');
    expect(host.querySelector<HTMLButtonElement>('.merge-menu-continue')?.disabled).toBe(true);
    select(0, 'remotes/origin/main');
    expect(host.querySelector('.merge-flow')?.textContent).toBe('origin/mainfeature');
    click('Continue · review merge');
    expect(merge).toHaveBeenCalledWith('remotes/origin/main', 'default', 'intoCurrent');
  });

  it('lets the current branch merge into a chosen local target and explains the automatic switch', () => {
    render();
    select(0, 'main');
    click('Current into another');
    expect(host.querySelectorAll('select')[0].value).toBe('');
    expect([...host.querySelectorAll('select')[0].options].map((option) => option.value)).toEqual(['', 'main']);
    expect(host.textContent).toContain('The app switches to the target branch');
    expect(host.textContent).toContain('Commit or stash first');
    select(0, 'main');
    expect(host.querySelector('.merge-flow')?.textContent).toBe('featuremain');
    select(1, 'noFf');
    click('Continue · review merge');
    expect(merge).toHaveBeenCalledWith('main', 'noFf', 'intoSelected');
  });

  it('explains squash staging and the fast-forward restriction beside the mode selector', () => {
    render();
    select(1, 'squash');
    expect(host.querySelector('.merge-menu-explanation')?.textContent).toContain('You then create a commit yourself');
    select(1, 'ffOnly');
    expect(host.querySelector('.merge-menu-explanation')?.textContent).toContain('Otherwise the merge stops');
    expect(host.querySelectorAll('select')[1].getAttribute('aria-describedby')).toBe(host.querySelector('.merge-menu-explanation')?.id);
  });

  it('explains disabled outward merging on detached HEAD', () => {
    render('');
    const outward = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Current into another')!;
    expect(outward.disabled).toBe(true);
    expect(host.textContent).toContain('no branch is currently active');
  });

  it('preserves selections on background refresh and disables a removed target', () => {
    render();
    click('Current into another');
    select(0, 'main');
    select(1, 'squash');
    render(
      'feature',
      branches.map((branch) => ({ ...branch })),
    );
    expect([...host.querySelectorAll('select')].map((element) => element.value)).toEqual(['main', 'squash']);
    render(
      'feature',
      branches.filter((branch) => branch.name !== 'main'),
    );
    expect(host.querySelector<HTMLButtonElement>('.merge-menu-continue')?.disabled).toBe(true);
  });
});
