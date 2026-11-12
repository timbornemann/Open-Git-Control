import { expect, it } from 'vitest';
import { tutorialObserverAttributes } from './tutorialObserverAttributes';

it('includes state selectors in nested completion conditions and feedback triggers', () => {
  expect(
    tutorialObserverAttributes(['class'], {
      kind: 'all',
      conditions: [
        { kind: 'element', selector: '[data-submodule-state="clean"]:has(input[aria-checked="true"])' },
        { kind: 'feedback', trigger: '[data-command-result]', message: ['[not-a-selector]', '[not-a-selector]'], error: false },
      ],
    }),
  ).toEqual(['class', 'data-submodule-state', 'aria-checked', 'data-command-result']);
});

it('includes dependent preparation actions, target controls and final readiness without treating example content as selectors', () => {
  expect(
    tutorialObserverAttributes(['class', 'open'], {
      actions: [
        { waitFor: '[data-example-state="ready"]' },
        { fill: { selector: '[data-field]', value: ['[private-content]', '[private-content]'] } },
        { waitValue: { selector: '[data-field]', value: ['[private-content]', '[private-content]'] } },
        { click: '[data-apply]' },
        { expand: '[aria-expanded="false"]' },
        { contextMenu: '[data-menu-owner]' },
      ],
      after: ['[data-after]'],
      ready: '[data-ready="true"]',
    }),
  ).toEqual(['class', 'open', 'data-example-state', 'data-field', 'data-apply', 'aria-expanded', 'data-menu-owner', 'data-after', 'data-ready']);
});

it('keeps baseline events for value and editor state checks without DOM selectors', () => {
  expect(tutorialObserverAttributes(['value', 'value', 'data-encoding'], { kind: 'working-tree', staged: ['[filename]'] })).toEqual(['value', 'data-encoding']);
  expect(tutorialObserverAttributes(['class'], undefined)).toEqual(['class']);
});
