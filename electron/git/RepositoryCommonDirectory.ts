import * as fs from 'node:fs';
import * as path from 'node:path';

export function repositoryCommonDirectory(repoPath: string): string | null {
  try {
    const dotGit = path.join(repoPath, '.git');
    let gitDir: string;
    if (fs.existsSync(dotGit)) {
      gitDir = fs.statSync(dotGit).isDirectory()
        ? dotGit
        : path.resolve(
            repoPath,
            fs
              .readFileSync(dotGit, 'utf8')
              .replace(/^gitdir:\s*/, '')
              .trim(),
          );
    } else if (fs.existsSync(path.join(repoPath, 'HEAD')) && fs.existsSync(path.join(repoPath, 'objects'))) {
      gitDir = repoPath;
    } else return null;
    const commonFile = path.join(gitDir, 'commondir');
    return fs.realpathSync.native(fs.existsSync(commonFile) ? path.resolve(gitDir, fs.readFileSync(commonFile, 'utf8').trim()) : gitDir);
  } catch {
    return null;
  }
}

export function physicalPathKey(repoPath: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native(repoPath);
  } catch {
    resolved = path.resolve(repoPath);
  }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
