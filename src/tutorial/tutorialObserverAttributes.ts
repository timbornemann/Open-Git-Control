import type { TutorialCompletion, TutorialStep } from '@/shared/tutorial/types';

const selectorKeys = new Set(['selector', 'trigger', 'waitFor', 'click', 'expand', 'collapse', 'contextMenu', 'submit', 'ready', 'after']);

/** State selectors must remain observable when React reuses the same DOM node. */
export function tutorialObserverAttributes(base: readonly string[], specification: TutorialStep['prepare'] | TutorialCompletion): string[] {
  const attributes = new Set(base);
  const visit = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (selectorKeys.has(key)) for (const match of value.matchAll(/\[\s*([\w:-]+)/g)) attributes.add(match[1]);
    } else if (Array.isArray(value)) {
      for (const entry of value) visit(entry, key);
    } else if (value && typeof value === 'object') {
      for (const [name, entry] of Object.entries(value)) visit(entry, name);
    }
  };
  visit(specification);
  return [...attributes];
}
