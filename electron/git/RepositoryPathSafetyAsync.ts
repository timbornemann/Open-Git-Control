import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { assertOutsideGitMetadata, isInside, normalizeRepositoryRelativePath } from './RepositoryPathSafety';

const nativeRealpath = promisify(fs.realpath.native);

/** Per-operation root resolution; never cache symlink targets between reads. */
export async function createRepositoryPathResolver(repoPath: string) {
  const rootPath = await fs.promises.realpath(repoPath);
  const nativeRoot = process.platform === 'win32' ? await nativeRealpath(rootPath) : rootPath;
  const candidate = (value: unknown, label: string): string => {
    const relative = normalizeRepositoryRelativePath(value, label);
    assertOutsideGitMetadata(relative, label);
    const target = path.resolve(rootPath, relative);
    if (!isInside(rootPath, target)) throw new Error(`${label} is outside the current repository.`);
    return target;
  };
  const checkPhysical = async (target: string, label: string, allowRoot = false): Promise<string> => {
    const physical = await fs.promises.realpath(target);
    if (!isInside(rootPath, physical, allowRoot)) throw new Error(`${label} is outside the current repository.`);
    assertOutsideGitMetadata(path.relative(rootPath, physical), label);
    if (process.platform === 'win32') {
      const native = await nativeRealpath(physical);
      if (!isInside(nativeRoot, native, allowRoot)) throw new Error(`${label} is outside the current repository.`);
      assertOutsideGitMetadata(path.relative(nativeRoot, native), label);
    }
    return physical;
  };
  const checkComponents = async (target: string, label: string, allowMissing: boolean) => {
    let current = rootPath;
    for (const segment of path.relative(rootPath, target).split(path.sep)) {
      current = path.join(current, segment);
      try {
        if ((await fs.promises.lstat(current)).isSymbolicLink()) throw new Error(`${label} cannot be accessed through a symbolic link.`);
      } catch (error) {
        if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
    }
  };
  return {
    rootPath,
    existing: async (value: unknown, label = 'File path'): Promise<string> => checkPhysical(candidate(value, label), label),
    existingWithoutSymlinks: async (value: unknown, label = 'File path'): Promise<string> => {
      const target = candidate(value, label);
      await checkComponents(target, label, false);
      return checkPhysical(target, label);
    },
    forCreateWithoutSymlinks: async (value: unknown, label = 'File path'): Promise<string> => {
      const target = candidate(value, label);
      await checkComponents(target, label, true);
      let parent = target;
      while (true) {
        try {
          await fs.promises.lstat(parent);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          parent = path.dirname(parent);
        }
      }
      await checkPhysical(parent, label, true);
      return target;
    },
  };
}
