import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

  it('rejects direct remote-helper clone sources before starting Git', async () => {
    const cloneWithProgress = vi.fn();
    const service = new CloneService({ cloneWithProgress });
    const targetDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-clone-policy-'));
    try {
      await expect(service.cloneRepo('ext::sh -c evil', targetDirectory, vi.fn())).resolves.toMatchObject({
        success: false,
        error: 'Git remote-helper clone sources are not allowed.',
      });
      expect(cloneWithProgress).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(targetDirectory, { recursive: true, force: true });
    }
  });
});
