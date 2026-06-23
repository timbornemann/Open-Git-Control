import { describe, expect, it } from 'vitest';
import { isForcePushCommand } from './appStateShared';

describe('isForcePushCommand', () => {
  it('detects force-push variants without flagging normal pushes', () => {
    expect(isForcePushCommand(['push'])).toBe(false);
    expect(isForcePushCommand(['push', 'origin', 'HEAD'])).toBe(false);
    expect(isForcePushCommand(['push', '--force-with-lease'])).toBe(true);
    expect(isForcePushCommand(['push', '--force-with-lease=refs/heads/main'])).toBe(true);
    expect(isForcePushCommand(['push', '-f', 'origin', 'main'])).toBe(true);
    expect(isForcePushCommand(['push', '--force'])).toBe(true);
    expect(isForcePushCommand(['pull', '--force'])).toBe(false);
  });
});
