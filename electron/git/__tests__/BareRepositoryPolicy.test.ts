import { describe, expect, it } from 'vitest';
import { shouldSuppressBareWorkTreeCommand } from '../BareRepositoryPolicy';

describe('BareRepositoryPolicy', () => {
  it('suppresses worktree-only status commands for bare repositories', () => {
    expect(shouldSuppressBareWorkTreeCommand(['status'])).toBe(true);
    expect(shouldSuppressBareWorkTreeCommand(['-c', 'core.quotepath=false', 'status', '--porcelain=v1'])).toBe(true);
  });

  it('suppresses numstat diff and submodule status but allows other commands', () => {
    expect(shouldSuppressBareWorkTreeCommand(['diff', '--numstat'])).toBe(true);
    expect(shouldSuppressBareWorkTreeCommand(['submodule', 'status', '--recursive'])).toBe(true);
    expect(shouldSuppressBareWorkTreeCommand(['log', '--oneline'])).toBe(false);
    expect(shouldSuppressBareWorkTreeCommand(['diff', '--name-only'])).toBe(false);
  });
});
