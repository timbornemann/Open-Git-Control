// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TutorialStep } from '@/shared/tutorial/types';
import { useTutorialCompletion } from './useTutorialCompletion';
import { demoBlobText } from './demoBlob';
import { DemoRepository } from './demoRepository';
import { writeDemoFile } from './demoFiles';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { TUTORIAL_FEEDBACK_EVENT } from '@/shared/tutorial/feedback';

let root: Root, container: HTMLDivElement, workspace: HTMLDivElement;
const step: TutorialStep = {
  id: 'field',
  title: ['', ''],
  description: ['', ''],
  area: 'repo',
  target: 'input',
  completion: { kind: 'value', selector: 'input', value: ['Fertig', 'Done'] },
};
function Harness({
  current = step,
  ready = true,
  language = 'de',
  repo,
}: {
  current?: TutorialStep;
  ready?: boolean;
  language?: 'de' | 'en';
  repo?: DemoRepository;
}) {
  return <output>{String(useTutorialCompletion(current, language, ready, repo))}</output>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  workspace = document.createElement('div');
  workspace.className = 'tutorial-workspace';
  workspace.innerHTML = '<input>';
  document.body.append(container, workspace);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  workspace.remove();
  vi.unstubAllGlobals();
});
const complete = () => container.textContent === 'true';
it('recognizes a preview URL assigned to an existing iframe without another click or render', async () => {
  workspace.innerHTML = '<iframe class="preview"></iframe>';
  const frame = workspace.querySelector('iframe')!;
  act(() => root.render(<Harness current={{ ...step, completion: { kind: 'element', selector: '.preview[src^="ogc-html-preview:"]' } }} />));
  expect(complete()).toBe(false);
  await act(async () => frame.setAttribute('src', 'ogc-html-preview://document/example'));
  expect(workspace.querySelector('iframe')).toBe(frame);
  expect(complete()).toBe(true);
  await act(async () => frame.removeAttribute('src'));
  expect(complete()).toBe(false);
});

it.each([
  ['aria-busy', 'true', 'false'],
  ['data-entry-count', '0', '1'],
  ['data-recovery-hash', 'original', 'restored'],
  ['data-submodule-state', 'uninitialized', 'clean'],
  ['data-branch-change-restored', 'false', 'true'],
])('checks completion again when only %s changes', async (attribute, before, after) => {
  workspace.innerHTML = `<div class="recovery-state" ${attribute}="${before}"></div>`;
  const control = workspace.querySelector('div')!;
  act(() => root.render(<Harness current={{ ...step, completion: { kind: 'element', selector: `.recovery-state[${attribute}="${after}"]` } }} />));
  expect(complete()).toBe(false);
  await act(async () => control.setAttribute(attribute, after));
  expect(complete()).toBe(true);
});

it('recognizes a delayed input default reflected in its value attribute without an input event', async () => {
  const field = workspace.querySelector('input')!;
  act(() => root.render(<Harness />));
  expect(complete()).toBe(false);
  await act(async () => field.setAttribute('value', 'Fertig'));
  expect(field.value).toBe('Fertig');
  expect(complete()).toBe(true);
});
it('observes native disclosure changes without requiring another render or input event', async () => {
  workspace.innerHTML = '<details><summary>Keep protected branches</summary><p>main</p></details>';
  act(() => root.render(<Harness current={{ ...step, completion: { kind: 'element', selector: 'details[open]' } }} />));
  expect(complete()).toBe(false);
  await act(async () => {
    workspace.querySelector('details')!.open = true;
  });
  expect(complete()).toBe(true);
  await act(async () => {
    workspace.querySelector('details')!.open = false;
  });
  expect(complete()).toBe(false);
});
it('requires current settled search results and responds when only their state attributes change', async () => {
  workspace.innerHTML = '<div class="working-search" data-search-settled="false" data-search-count="0"></div>';
  const search = workspace.querySelector<HTMLElement>('.working-search')!;
  act(() =>
    root.render(
      <Harness current={{ ...step, completion: { kind: 'element', selector: '.working-search[data-search-settled="true"][data-search-count="5"]' } }} />,
    ),
  );
  await act(async () => {
    search.dataset.searchCount = '5';
  });
  expect(complete()).toBe(false);
  await act(async () => {
    search.dataset.searchSettled = 'true';
  });
  expect(complete()).toBe(true);
  await act(async () => {
    search.dataset.searchSettled = 'false';
  });
  expect(complete()).toBe(false);
});
it('requires a new result receipt when the toast queue deduplicates identical feedback', async () => {
  workspace.innerHTML = '<button class="validate">Validate</button><div class="action-toast error"><span class="toast-msg">Invalid YAML</span></div>';
  const current: TutorialStep = { ...step, completion: { kind: 'feedback', trigger: '.validate', message: ['Invalid YAML', 'Invalid YAML'], error: true } };
  const receipt = (message = 'Invalid YAML', isError = true) =>
    act(() => {
      window.dispatchEvent(new CustomEvent(TUTORIAL_FEEDBACK_EVENT, { detail: { message, isError } }));
    });
  act(() => root.render(<Harness current={current} />));
  receipt();
  expect(complete()).toBe(false);
  act(() => workspace.querySelector<HTMLButtonElement>('button')!.click());
  expect(complete()).toBe(false);
  receipt('Another error');
  receipt('Invalid YAML', false);
  expect(complete()).toBe(false);
  receipt();
  expect(complete()).toBe(true);
  await act(async () => {
    workspace.querySelector('.action-toast')!.remove();
  });
  expect(complete()).toBe(true);
  act(() => root.render(<Harness current={{ ...current, id: 'next' }} />));
  expect(complete()).toBe(false);
});
it('recognizes fresh keyboard-submitted feedback without accepting typing or an old error', () => {
  workspace.innerHTML = '<input class="branch-name"><div class="action-toast error"><span class="toast-msg">Invalid branch name</span></div>';
  const current: TutorialStep = {
    ...step,
    completion: { kind: 'feedback', trigger: '.branch-name', message: ['Invalid branch name', 'Invalid branch name'], error: true },
  };
  const field = workspace.querySelector('input')!;
  const receipt = () => window.dispatchEvent(new CustomEvent(TUTORIAL_FEEDBACK_EVENT, { detail: { message: 'Invalid branch name', isError: true } }));
  act(() => root.render(<Harness current={current} />));
  for (const options of [{ key: 'a' }, { key: 'Enter', repeat: true }, { key: 'Enter', isComposing: true }]) {
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { ...options, bubbles: true }));
      receipt();
    });
    expect(complete()).toBe(false);
  }
  act(() => {
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(complete()).toBe(false);
  act(receipt);
  expect(complete()).toBe(true);
});
it('keeps an input step complete when Enter has already replaced the form with its successful result', async () => {
  workspace.innerHTML = '<input value="feature/lernen">';
  const current: TutorialStep = {
    ...step,
    completion: {
      kind: 'any',
      conditions: [
        { kind: 'value', selector: 'input', value: ['feature/lernen', 'feature/lernen'] },
        { kind: 'element', selector: '[data-created-branch="feature/lernen"]' },
      ],
    },
  };
  act(() => root.render(<Harness current={current} />));
  expect(complete()).toBe(true);
  await act(async () => {
    workspace.innerHTML = '<output data-created-branch="feature/lernen"></output>';
  });
  expect(complete()).toBe(true);
  await act(async () => {
    workspace.innerHTML = '<output data-created-branch="wrong-branch"></output>';
  });
  expect(complete()).toBe(false);
});
it('accepts equivalent schema JSON while rejecting changed rules and invalid syntax', async () => {
  const current: TutorialStep = {
    ...step,
    completion: {
      kind: 'value',
      selector: 'input',
      value: ['{"type":"object","required":["name"]}', '{"type":"object","required":["name"]}'],
      comparison: 'json',
    },
  };
  act(() => root.render(<Harness current={current} />));
  type('{ /* schema */ "required": ["name"], "type": "object", }');
  expect(complete()).toBe(true);
  type('{"type":"object","required":[]}');
  expect(complete()).toBe(false);
  type('{');
  expect(complete()).toBe(false);
});
it('checks copied practice values together with a current copy attempt', async () => {
  const repo = new DemoRepository();
  repo.reset({ ...step, scenario: 'hashes' });
  workspace.innerHTML = '<button class="copy">Copy</button><div class="action-toast success"><span class="toast-msg">Copied</span></div>';
  const current: TutorialStep = {
    ...step,
    completion: {
      kind: 'all',
      conditions: [
        { kind: 'clipboard', value: ['expected', 'expected'] },
        { kind: 'feedback', trigger: '.copy', message: ['Kopiert', 'Copied'], error: false },
      ],
    },
  };
  act(() => root.render(<Harness current={current} repo={repo} language="en" />));
  act(() => workspace.querySelector<HTMLButtonElement>('.copy')!.click());
  expect(complete()).toBe(false);
  act(() => {
    repo.clipboard = 'expected';
    repo.mark('clipboard-copied');
  });
  expect(complete()).toBe(false);
  await act(async () => {
    const toast = document.createElement('div');
    toast.className = 'action-toast success';
    toast.innerHTML = '<span class="toast-msg">Copied</span>';
    workspace.append(toast);
  });
  expect(complete()).toBe(true);
  act(() => root.render(<Harness current={{ ...current, id: 'next-copy' }} repo={repo} language="en" />));
  expect(complete()).toBe(false);
});
it('requires the exact selection and preserves the complete document condition', async () => {
  const createRange = document.createRange.bind(document);
  const geometry = vi
    .spyOn(document, 'createRange')
    .mockImplementation(() => Object.assign(createRange(), { getClientRects: () => [], getBoundingClientRect: () => new DOMRect() }));
  const view = new EditorView({ parent: workspace, state: EditorState.create({ doc: 'before Café after\n' }) });
  const current: TutorialStep = {
    ...step,
    completion: {
      kind: 'all',
      conditions: [
        { kind: 'value', selector: '.cm-editor', value: ['before Café after\n', 'before Café after\n'] },
        { kind: 'selection', selector: '.cm-editor', from: 7, to: 11 },
      ],
    },
  };
  try {
    act(() => root.render(<Harness current={current} />));
    await act(async () => {
      view.dispatch({ selection: { anchor: 7, head: 10 } });
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(complete()).toBe(false);
    await act(async () => {
      view.dispatch({ selection: { anchor: 11, head: 7 } });
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(complete()).toBe(true);
    await act(async () => {
      view.dispatch({ changes: { from: 0, to: 6, insert: 'wrong!' } });
      document.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(complete()).toBe(false);
  } finally {
    view.destroy();
    geometry.mockRestore();
  }
});
it('requires a current attempt and matching feedback even when an old error is visible', async () => {
  workspace.innerHTML =
    '<input value="bad"><button class="decode">Decode</button><button class="other">Other</button><div class="action-toast error"><span class="toast-msg">Old error</span></div>';
  const current: TutorialStep = {
    ...step,
    completion: {
      kind: 'all',
      conditions: [
        { kind: 'value', selector: 'input', value: ['bad', 'bad'] },
        { kind: 'feedback', trigger: '.decode', message: ['Erwarteter Fehler', 'Expected error'], error: true },
      ],
    },
  };
  act(() => root.render(<Harness current={current} language="en" />));
  expect(complete()).toBe(false);
  act(() => workspace.querySelector<HTMLButtonElement>('.other')!.click());
  expect(complete()).toBe(false);
  act(() => workspace.querySelector<HTMLButtonElement>('.decode')!.click());
  expect(complete()).toBe(false);
  await act(async () => {
    workspace.querySelector('.toast-msg')!.textContent = 'Expected error';
  });
  expect(complete()).toBe(true);
  act(() => root.render(<Harness current={{ ...current, id: 'next-attempt' }} language="en" />));
  expect(complete()).toBe(false);
});
const type = (value: string) =>
  act(() => {
    const input = workspace.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

it('waits for the exact rendered text and observes text-node updates', async () => {
  workspace.innerHTML = '<h1>Old title</h1>';
  const current: TutorialStep = { ...step, completion: { kind: 'text', selector: 'h1', value: ['Neue Überschrift', 'New heading'] } };
  act(() => root.render(<Harness current={current} language="en" />));
  expect(complete()).toBe(false);
  await act(async () => {
    workspace.querySelector('h1')!.firstChild!.textContent = 'Neue Überschrift';
  });
  expect(complete()).toBe(false);
  await act(async () => {
    workspace.querySelector('h1')!.firstChild!.textContent = 'New heading';
  });
  expect(complete()).toBe(true);
});

it('observes disappearance while another combined condition is still incomplete', async () => {
  const repo = new DemoRepository();
  repo.reset({ ...step, scenario: 'clean' });
  workspace.innerHTML = '<div class="open-viewer"></div>';
  const current: TutorialStep = {
    ...step,
    completion: {
      kind: 'all',
      conditions: [
        { kind: 'working-tree', content: [{ path: 'README.md', source: 'worktree', value: ['Saved\n', 'Saved\n'] }] },
        { kind: 'absent', selector: '.open-viewer' },
      ],
    },
  };
  act(() => root.render(<Harness current={current} repo={repo} />));
  expect(complete()).toBe(false);
  await act(async () => {
    workspace.querySelector('.open-viewer')!.remove();
  });
  expect(complete()).toBe(false);
  act(() => writeDemoFile(repo, 'README.md', 'Saved\n'));
  expect(complete()).toBe(true);
});

it('requires the full instructed example and cancels completion if the value changes', () => {
  act(() => root.render(<Harness />));
  type('F');
  expect(complete()).toBe(false);
  type('Fertig');
  expect(complete()).toBe(true);
  type('Ferti');
  expect(complete()).toBe(false);
  act(() => root.render(<Harness language="en" />));
  type('Done');
  expect(complete()).toBe(true);
});
it('waits for initial preparation and supports real selects and checkboxes', () => {
  workspace.innerHTML = '<select><option value="docs">docs</option></select>';
  const current = { ...step, completion: { kind: 'value' as const, selector: 'select', value: ['docs', 'docs'] as const } };
  act(() => root.render(<Harness current={current} ready={false} />));
  expect(complete()).toBe(false);
  act(() => root.render(<Harness current={current} />));
  expect(complete()).toBe(true);
  workspace.innerHTML = '<input type="checkbox">';
  act(() => root.render(<Harness current={{ ...step, id: 'checkbox', completion: { kind: 'value', selector: 'input', value: ['true', 'true'] } }} />));
  expect(complete()).toBe(false);
  act(() => workspace.querySelector('input')!.click());
  expect(complete()).toBe(true);
});
it('recognizes a real resulting element and updates after it disappears', async () => {
  act(() => root.render(<Harness current={{ ...step, completion: { kind: 'element', selector: '.selected' } }} />));
  await act(async () => {
    workspace.innerHTML = '<button class="selected"></button>';
  });
  expect(complete()).toBe(true);
  await act(async () => {
    workspace.firstElementChild!.className = '';
  });
  expect(complete()).toBe(false);
});
it('waits until a portaled dialog was actually opened before recognizing its closure', async () => {
  const dialog = document.createElement('div');
  dialog.className = 'exercise-dialog';
  act(() => root.render(<Harness current={{ ...step, completion: { kind: 'absent', selector: '.exercise-dialog' } }} />));
  expect(complete()).toBe(false);
  await act(async () => {
    document.body.append(dialog);
  });
  expect(complete()).toBe(false);
  await act(async () => {
    dialog.remove();
  });
  expect(complete()).toBe(true);
});
it('detects a pressed filter button without requiring a form event', async () => {
  workspace.innerHTML = '<button aria-pressed="false"></button>';
  act(() => root.render(<Harness current={{ ...step, completion: { kind: 'element', selector: '[aria-pressed="true"]' } }} />));
  await act(async () => {
    workspace.querySelector('button')!.setAttribute('aria-pressed', 'true');
  });
  expect(complete()).toBe(true);
});
it('requires the exact index selection and rejects an additional wrong file', () => {
  const repo = new DemoRepository();
  repo.reset({ ...step, scenario: 'scope' });
  const current: TutorialStep = {
    ...step,
    completion: { kind: 'working-tree', staged: ['src/app.ts', 'README.md'], unstaged: ['package.json'], untracked: ['notes.txt', 'docs/ideas.md'] },
  };
  act(() => root.render(<Harness current={current} repo={repo} />));
  expect(complete()).toBe(false);
  act(() => {
    repo.stage(['notes.txt']);
    repo.stage(['README.md']);
  });
  expect(complete()).toBe(false);
  act(() => {
    repo.command('reset', 'HEAD', '--', 'notes.txt');
  });
  expect(complete()).toBe(true);
  act(() => {
    repo.command('reset', 'HEAD', '--', 'README.md');
  });
  expect(complete()).toBe(false);
});
it('checks actual file contents and deletion rather than only visibility in the list', () => {
  const repo = new DemoRepository();
  repo.reset({ ...step, scenario: 'scope' });
  const chosen = demoBlobText(repo.files['README.md'])!;
  const current: TutorialStep = {
    ...step,
    completion: {
      kind: 'working-tree',
      content: [
        { path: 'README.md', source: 'index', value: [chosen, chosen] },
        { path: 'README.md', source: 'worktree', value: [chosen, chosen] },
      ],
      absent: ['notes.txt'],
    },
  };
  act(() => root.render(<Harness current={current} repo={repo} />));
  act(() => {
    repo.stage(['README.md']);
    repo.command('clean', '-f', '--', 'notes.txt');
    writeDemoFile(repo, 'README.md', chosen + 'extra\n');
  });
  expect(complete()).toBe(false);
  act(() => {
    repo.command('checkout', '--', 'README.md');
  });
  expect(complete()).toBe(true);
  act(() => {
    writeDemoFile(repo, 'notes.txt', 'Restored new file\n');
  });
  expect(complete()).toBe(false);
});
