import { describe, expect, it, vi } from 'vitest';
import { emitJobEvent } from '../jobEvents';

const payload = {
  id: 'job-1',
  operation: 'git:push',
  status: 'start' as const,
  timestamp: 1,
};

describe('emitJobEvent', () => {
  it('skips destroyed web contents', () => {
    const send = vi.fn();

    expect(() => emitJobEvent({ isDestroyed: () => true, send } as any, payload)).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores Electron object-destroyed send races', () => {
    const send = vi.fn(() => {
      throw new Error('Object has been destroyed');
    });

    expect(() => emitJobEvent({ isDestroyed: () => false, send } as any, payload)).not.toThrow();
  });
});
