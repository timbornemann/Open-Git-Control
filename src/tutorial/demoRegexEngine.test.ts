import { expect, it } from 'vitest';
import { matchDemoRegex } from './demoRegexEngine';
const records = [['export const greeting = "Hallo";', 'export const greeting = "Hallo Welt!";'], [], ['export const greeting = "Hallo";'], []];
it.each([
  ['Hallo', [0, 2]],
  ['^export const greeting', [0, 2]],
  ['"Hallo";$', [0, 2]],
  ['"Hallo Welt!";$', [0]],
  ['Hallo( Welt!)?', [0, 2]],
  ['[Ww]elt', [0]],
  ['hallo', []],
  ['absent', []],
] as const)('matches changed and removed lines using %s', (pattern, expected) => {
  expect(matchDemoRegex({ pattern, records, limit: 200 })).toEqual({ success: true, data: expected });
});
it('retains empty changed lines, respects result limits and reports malformed/unsupported patterns', () => {
  expect(matchDemoRegex({ pattern: '^$', records: [[''], ['text']], limit: 10 })).toEqual({ success: true, data: [0] });
  expect(matchDemoRegex({ pattern: 'Hallo', records, limit: 1 })).toEqual({ success: true, data: [0] });
  expect(matchDemoRegex({ pattern: '[', records, limit: 10 })).toMatchObject({ success: false, error: expect.stringContaining('Invalid regular expression:') });
  for (const pattern of ['(?=Hallo)', '\\d+', '[[:digit:]]', '(Hallo)\\1'])
    expect(matchDemoRegex({ pattern, records, limit: 10 })).toMatchObject({ success: false, error: expect.stringContaining('not supported') });
});
it('preserves Git LF anchors, CR contents and the final newline distinction', () => {
  const records = [['updated\r\n'], ['updated'], ['line\n']];
  expect(matchDemoRegex({ pattern: '^$', records, limit: 10 })).toEqual({ success: true, data: [0, 2] });
  expect(matchDemoRegex({ pattern: '^updated$', records, limit: 10 })).toEqual({ success: true, data: [1] });
  expect(matchDemoRegex({ pattern: '^updated.$', records, limit: 10 })).toEqual({ success: true, data: [0] });
  expect(matchDemoRegex({ pattern: '^line.$', records, limit: 10 })).toEqual({ success: true, data: [] });
});
