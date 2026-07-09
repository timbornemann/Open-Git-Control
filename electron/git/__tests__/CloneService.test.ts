import { describe, expect, it, vi } from 'vitest';
import { CloneService } from '../CloneService';

describe('GitService clone target naming', () => {
  it('derives a stable repo name from a Windows local bare path', () => {
    const service = new CloneService({ cloneWithProgress: vi.fn() });
    const repoName = service.deriveCloneRepoName('D:\\Projects\\Software\\zz. Test-remote.git');
    expect(repoName).toBe('zz. Test-remote');
  });

  it('sanitizes explicit clone target names', () => {
    const service = new CloneService({ cloneWithProgress: vi.fn() });
    const sanitized = service.sanitizeCloneTargetName('demo/repo:name.');
    expect(sanitized).toBe('demo-repo-name');
  });
});
