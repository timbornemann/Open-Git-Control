import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSystemToolAvailable, requestSystemTools, updateSystemToolsAvailability } from '../systemToolsAvailability';

afterEach(() => {
  vi.unstubAllGlobals();
  updateSystemToolsAvailability([]);
});
describe('renderer tool readiness', () => {
  it('preserves older bridges while holding Git reads until its first real verification', () => {
    vi.stubGlobal('window', {});
    expect(isSystemToolAvailable('git')).toBe(true);
    vi.stubGlobal('window', { electronAPI: { app: { getSystemToolsStatus: vi.fn() } } });
    expect(isSystemToolAvailable('git')).toBe(false);
    updateSystemToolsAvailability([{ id: 'git', state: 'checking' }]);
    expect(isSystemToolAvailable('git')).toBe(false);
    updateSystemToolsAvailability([
      { id: 'git', state: 'available' },
      { id: 'git-lfs', state: 'missing' },
    ]);
    expect(isSystemToolAvailable('git')).toBe(true);
    expect(isSystemToolAvailable('git-lfs')).toBe(false);
    vi.unstubAllGlobals();
    expect(isSystemToolAvailable('git')).toBe(true);
  });
  it('requests the same tool management from Git and optional-tool workflows', () => {
    class Event {
      constructor(
        public type: string,
        public options: { detail: string },
      ) {}
    }
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', Event);
    requestSystemTools();
    requestSystemTools('git-lfs');
    expect(dispatchEvent.mock.calls.map(([event]) => [event.type, event.options.detail])).toEqual([
      ['system-tools:open', 'git'],
      ['system-tools:open', 'git-lfs'],
    ]);
  });
});
