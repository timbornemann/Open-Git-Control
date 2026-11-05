import type { DemoRepository } from './demoRepository';
import type { IpcResult } from '@/types/ipc';
import { observeDemoFile } from './demoFileVersions';
import { rememberDemoParents } from './demoDirectories';
import { demoBlobText, sameDemoBlob, getDemoBlob, setDemoBlob, isDemoGitlink, type DemoBlob, type DemoFiles } from './demoBlob';

const has = (files: DemoFiles, path: string) => Object.prototype.hasOwnProperty.call(files, path);
const success = (): IpcResult<string> => ({ success: true, data: '' });
const failure = (message: string): IpcResult<string> => ({ success: false, error: message });
const different = (left: DemoFiles, right: DemoFiles, path: string) => !sameDemoBlob(getDemoBlob(left, path), getDemoBlob(right, path));

/** Implements the file, folder and wildcard rules offered by practice menus. */
function matchesRule(path: string, rule: string) {
  const anchored = rule.startsWith('/');
  const directory = rule.endsWith('/');
  const pattern = rule.replace(/^\//, '').replace(/\/$/, '');
  let expression = '';
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === '\\' && index + 1 < pattern.length) expression += pattern[++index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (character === '*') {
      if (pattern[index + 1] === '*') {
        expression += '.*';
        index++;
      } else expression += '[^/]*';
    } else if (character === '?') expression += '[^/]';
    else expression += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${anchored || pattern.includes('/') ? '^' : '(?:^|/)'}${expression}${directory ? '(?:/|$)' : '$'}`).test(path);
}
export function isDemoIgnored(repo: DemoRepository, path: string) {
  let ignored = false;
  for (const raw of (demoBlobText(repo.files['.gitignore']) || '').split(/\r?\n/)) {
    const rule = raw.trim();
    if (!rule || rule.startsWith('#')) continue;
    const negate = rule.startsWith('!');
    if (matchesRule(path, negate ? rule.slice(1) : rule)) ignored = !negate;
  }
  return ignored;
}
export function refreshDemoFile(repo: DemoRepository, path: string) {
  if (has(repo.files, path)) rememberDemoParents(repo, path);
  observeDemoFile(repo, path);
  repo.staged.delete(path);
  repo.modified.delete(path);
  repo.untracked.delete(path);
  if (repo.mergeState?.conflicts.has(path)) {
    repo.modified.add(path);
    return;
  }
  if (different(repo.headFiles, repo.indexFiles, path)) repo.staged.add(path);
  if (has(repo.indexFiles, path)) {
    if (different(repo.indexFiles, repo.files, path)) repo.modified.add(path);
  } else if (has(repo.files, path) && !isDemoIgnored(repo, path)) repo.untracked.add(path);
}
export function refreshDemoFiles(repo: DemoRepository) {
  for (const path of new Set([
    ...Object.keys(repo.files),
    ...Object.keys(repo.headFiles),
    ...Object.keys(repo.indexFiles),
    ...repo.untracked,
    ...repo.modified,
    ...repo.staged,
  ]))
    refreshDemoFile(repo, path);
}
export function seedDemoVersions(repo: DemoRepository, head: DemoFiles) {
  repo.headFiles = structuredClone(head);
  repo.indexFiles = structuredClone(head);
  for (const path of repo.staged) {
    if (has(repo.files, path)) setDemoBlob(repo.indexFiles, path, repo.files[path]);
    else delete repo.indexFiles[path];
  }
  refreshDemoFiles(repo);
}
function changed(repo: DemoRepository, event: string) {
  repo.mark(event);
  repo.emitChannel('tree', repo.activeRepo);
}
export function writeDemoFile(repo: DemoRepository, path: string, content: DemoBlob) {
  setDemoBlob(repo.files, path, content);
  if (path === '.gitignore') refreshDemoFiles(repo);
  else refreshDemoFile(repo, path);
  changed(repo, 'file-saved');
}
export function writeDemoIndexFile(repo: DemoRepository, path: string, content: DemoBlob) {
  setDemoBlob(repo.indexFiles, path, content);
  refreshDemoFile(repo, path);
  changed(repo, 'index-saved');
}
export function stageDemoFiles(repo: DemoRepository, paths: readonly string[]): IpcResult<string> {
  const selected = [...new Set(paths.some((path) => ['.', '-A', '--all'].includes(path)) ? [...repo.modified, ...repo.untracked] : paths)];
  if (selected.some((path) => !has(repo.files, path) && !has(repo.headFiles, path) && !has(repo.indexFiles, path))) return failure('Unknown practice file.');
  for (const path of selected) {
    if (!has(repo.indexFiles, path) && !has(repo.headFiles, path) && isDemoIgnored(repo, path)) continue;
    if (has(repo.files, path)) setDemoBlob(repo.indexFiles, path, repo.files[path]);
    else delete repo.indexFiles[path];
    repo.mergeState?.conflicts.delete(path);
    if (repo.mergeState) repo.conflicted = Boolean(repo.mergeState.conflicts.size);
    refreshDemoFile(repo, path);
  }
  changed(repo, 'staged');
  return success();
}
export function unstageDemoFiles(repo: DemoRepository, paths: readonly string[]) {
  for (const path of paths.length ? paths : new Set([...repo.staged, ...(repo.mergeState?.conflicts.keys() || [])])) {
    if (has(repo.headFiles, path)) setDemoBlob(repo.indexFiles, path, repo.headFiles[path]);
    else delete repo.indexFiles[path];
    repo.mergeState?.conflicts.delete(path);
    if (repo.mergeState) repo.conflicted = Boolean(repo.mergeState.conflicts.size);
    refreshDemoFile(repo, path);
  }
  changed(repo, 'unstaged');
  return success();
}
export function removeDemoIndexFiles(repo: DemoRepository, paths: readonly string[]) {
  if (!paths.length || paths.some((path) => !has(repo.indexFiles, path) && !repo.mergeState?.conflicts.has(path)))
    return failure('Choose an indexed practice file.');
  for (const path of paths) {
    delete repo.indexFiles[path];
    repo.mergeState?.conflicts.delete(path);
    if (repo.mergeState) repo.conflicted = Boolean(repo.mergeState.conflicts.size);
    refreshDemoFile(repo, path);
  }
  changed(repo, 'tracking-removed');
  return success();
}
export function discardDemoFiles(repo: DemoRepository, paths: readonly string[]) {
  const selected = paths.includes('.') ? [...repo.modified] : [...new Set(paths)];
  if (selected.some((path) => repo.mergeState?.conflicts.has(path))) return failure('Choose a saved conflict side before restoring an unmerged practice file.');
  if (selected.some((path) => !has(repo.indexFiles, path))) return failure('Only tracked practice files can be restored from the index.');
  for (const path of selected) {
    if (!isDemoGitlink(repo.indexFiles[path])) setDemoBlob(repo.files, path, repo.indexFiles[path]);
    refreshDemoFile(repo, path);
  }
  changed(repo, 'discarded');
  return success();
}
export function deleteDemoFiles(repo: DemoRepository, paths: readonly string[]) {
  if (!paths.length || paths.some((path) => !repo.untracked.has(path))) return failure('Choose an untracked practice file.');
  for (const path of paths) {
    delete repo.files[path];
    refreshDemoFile(repo, path);
  }
  changed(repo, 'file-deleted');
  return success();
}
export function ignoreDemoRule(repo: DemoRepository, pattern: string) {
  if (!pattern.trim() || /[\r\n\0]/.test(pattern)) return { success: false as const, error: 'Use one practice ignore rule.' };
  const previous = demoBlobText(repo.files['.gitignore']) || '';
  const added = !previous.split(/\r?\n/).includes(pattern);
  if (added) writeDemoFile(repo, '.gitignore', `${previous}${previous && !previous.endsWith('\n') ? '\n' : ''}${pattern}\n`);
  repo.mark(added ? 'ignore-added' : 'ignore-repeated');
  return { success: true as const, added };
}
