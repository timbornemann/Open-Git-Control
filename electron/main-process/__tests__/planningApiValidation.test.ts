import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

import { itemInputFromBody, itemUpdateFromBody, parsePriority, parseStatus, queryOptionsFromUrl } from '../planningApiDomain';

describe('planner API enum validation', () => {
  it.each(['__proto__', 'constructor'])('rejects inherited object property %s as a status or priority', (value) => {
    expect(() => parseStatus(value)).toThrow('status must be one of');
    expect(() => parsePriority(value)).toThrow('priority must be one of');
    expect(() => itemInputFromBody({ title: 'Todo', status: value })).toThrow('status must be one of');
    expect(() => itemInputFromBody({ title: 'Todo', priority: value })).toThrow('priority must be one of');
    expect(() => itemUpdateFromBody({ status: value })).toThrow('status must be one of');
    expect(() => itemUpdateFromBody({ priority: value })).toThrow('priority must be one of');
    expect(() => queryOptionsFromUrl(new URL(`http://127.0.0.1/api/todos?status=${value}`))).toThrow('status must be one of');
  });

  it('retains documented aliases and optional blank values', () => {
    expect(parseStatus('working')).toBe('in-progress');
    expect(parsePriority('kritisch')).toBe('urgent');
    expect(parseStatus('')).toBeUndefined();
    expect(parsePriority(undefined)).toBeUndefined();
  });
});
