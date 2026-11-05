// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Input } from '@/components/Input';
import { useTutorialPreparation } from './useTutorialPreparation';
import type { TutorialStep } from '@/shared/tutorial/types';
vi.mock('@/i18n', () => ({ useI18n: () => ({ tr: (_de: string, en: string) => en, t: (key: string) => key }) }));
it('initializes an empty real Input dialog before restoring and submitting its filename', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  host.className = 'tutorial-workspace';
  document.body.append(host);
  const root = createRoot(host),
    submitted = vi.fn();
  const fields = [{ id: 'name', label: 'Name', required: true }];
  const step: TutorialStep = {
    id: 'new-file',
    area: 'repo',
    title: ['', ''],
    description: ['', ''],
    target: '.done',
    prepare: {
      actions: [
        { click: '.open' },
        { fill: { selector: '[data-dialog-field="name"] input', value: ['notes.md', 'notes.md'] } },
        { click: '[data-dialog-action="confirm"]' },
      ],
      ready: '.done',
    },
  };
  function Form() {
    const [open, setOpen] = useState(false),
      [done, setDone] = useState(false);
    const ready = useTutorialPreparation(step);
    return (
      <>
        <button className="open" onClick={() => setOpen(true)}>
          Open
        </button>
        {open && (
          <Input
            open
            title="Add file"
            fields={fields}
            confirmLabel="Add file"
            onCancel={() => setOpen(false)}
            onSubmit={(values) => {
              submitted(values);
              setOpen(false);
              setDone(true);
            }}
          />
        )}
        {done && <output className="done">{String(ready)}</output>}
      </>
    );
  }
  try {
    await act(async () => {
      root.render(<Form />);
    });
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
    });
    expect(submitted).toHaveBeenCalledExactlyOnceWith({ name: 'notes.md' });
    expect(host.querySelector('output')?.textContent).toBe('true');
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
