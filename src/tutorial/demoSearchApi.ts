import type { ElectronGitAPI, WorkingDirectorySearchFileDto, WorkingDirectoryReplaceRequestDto } from '@/shared/ipc/contracts/git';
import { asSearchQuery, asReplacement, fileName, findLineMatches, searchFileNames, replaceAllLiteral, replaceTarget } from '@/shared/workingDirectorySearch';
import type { DemoRepository } from './demoRepository';
import { demoBlob, demoBlobBytes, getDemoBlob, readDemoBlob, setDemoBlob, isDemoGitlink, type DemoBlob } from './demoBlob';
import { isDemoIgnored, refreshDemoFiles } from './demoFiles';
import { touchDemoWorkFile } from './demoFileVersions';
import { validDemoTreePath } from './demoDirectories';

const failure = (cause: unknown) => ({ success: false as const, error: cause instanceof Error ? cause.message : String(cause) });
/** Searches saved in-memory files. Neither editor drafts nor native IO are read. */
export function createDemoSearchApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  const authorize = (path: string) => {
    if (path !== repo.activeRepo) throw new Error('The practice repository changed.');
  };
  const candidates = () => {
    const paths = [...new Set([...Object.keys(repo.indexFiles), ...Object.keys(repo.files).filter((path) => !isDemoIgnored(repo, path))])].sort((a, b) =>
      a.localeCompare(b),
    );
    const files = paths.filter((path) => !isDemoGitlink(repo.files[path]) && !isDemoGitlink(repo.indexFiles[path]));
    return { paths: files.slice(0, 20_000), truncated: files.length > 20_000 };
  };
  const read = (path: string) => {
    if (!validDemoTreePath(path)) throw new Error('Choose a valid relative practice path.');
    const blob = getDemoBlob(repo.files, path);
    if (blob === undefined) throw new Error('The practice file no longer exists.');
    const decoded = readDemoBlob(blob);
    if (decoded.bytes.length > 2 * 1024 * 1024) throw new Error('The practice file is too large for inline text editing.');
    if (decoded.encoding === 'binary') throw new Error('The practice file is binary.');
    return decoded;
  };
  const replace = (request: WorkingDirectoryReplaceRequestDto) => {
    const query = asSearchQuery(request?.query),
      replacement = asReplacement(request?.replacement),
      matchCase = request?.caseSensitive === true;
    const all = request?.all === true ? candidates() : null;
    if (all?.truncated) throw new Error('Replace all is limited to 20000 repository files.');
    const targets = request?.target ? [request.target.path] : all?.paths || request?.paths;
    if (!Array.isArray(targets) || !targets.length) throw new Error('At least one result file is required.');
    const paths = [...new Map(targets.map((path) => [String(path).toLowerCase(), String(path)])).values()];
    if (!all && paths.length > 1_000) throw new Error('Cannot replace in more than 1000 files at once.');
    const prepared: { path: string; blob: DemoBlob; count: number }[] = [];
    let characters = 0;
    for (const path of paths) {
      let original: ReturnType<typeof read>;
      try {
        original = read(path);
      } catch (error) {
        if (all) continue;
        throw error;
      }
      const result = request.target
        ? replaceTarget(original.text, query, replacement, matchCase, request.target.line, request.target.column)
        : replaceAllLiteral(original.text, query, replacement, matchCase);
      if (!result.count) continue;
      if (prepared.length >= 1_000) throw new Error('Cannot replace in more than 1000 files at once.');
      characters += original.text.length;
      if (characters > 50 * 1024 * 1024) throw new Error('The matching files are too large to replace safely in one operation.');
      const blob = demoBlob(result.text, original.encoding);
      demoBlobBytes(blob);
      prepared.push({ path, blob, count: result.count });
    }
    for (const item of prepared) setDemoBlob(repo.files, item.path, item.blob);
    if (prepared.length) {
      refreshDemoFiles(repo);
      prepared.forEach((item) => touchDemoWorkFile(repo, item.path));
      repo.mark('search-replaced');
      repo.emitChannel('tree', repo.activeRepo);
    }
    return { replacements: prepared.reduce((sum, item) => sum + item.count, 0), paths: prepared.map((item) => item.path) };
  };
  return {
    searchWorkingDirectory: async (request, repoPath) => {
      try {
        authorize(repoPath);
        const query = asSearchQuery(request?.query),
          matchCase = request?.caseSensitive === true;
        if (!['filename', 'content'].includes(request?.mode)) throw new Error('Invalid search mode.');
        const candidate = candidates();
        if (request.mode === 'filename') return { success: true, data: searchFileNames(candidate.paths, query, matchCase, candidate.truncated) };
        const files: WorkingDirectorySearchFileDto[] = [];
        let totalMatches = 0,
          displayed = 0,
          scannedFiles = 0,
          truncated = candidate.truncated;
        for (const path of candidate.paths) {
          let source: ReturnType<typeof read>;
          try {
            source = read(path);
          } catch {
            continue;
          }
          scannedFiles++;
          const result = findLineMatches(source.text, query, matchCase, Math.min(200, Math.max(0, 1_000 - displayed)));
          totalMatches += result.total;
          if (result.matches.length) {
            files.push({ path, name: fileName(path), matches: result.matches });
            displayed += result.matches.length;
          }
          if (result.total > result.matches.length) truncated = true;
        }
        return { success: true, data: { files, totalMatches, scannedFiles, truncated } };
      } catch (cause) {
        return failure(cause);
      }
    },
    replaceWorkingDirectory: async (request, repoPath) => {
      try {
        authorize(repoPath);
        return { success: true, data: replace(request) };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
