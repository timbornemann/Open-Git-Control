import { StringDecoder } from 'node:string_decoder';
import type { AnalyticsProject, AnalyticsProgress, AnalyticsIdentity } from '../../src/shared/ipc/repositoryAnalytics';
import type { AnalyticsGit } from './AnalyticsGit';
import type { AnalyticsCache } from './AnalyticsCache';
import type { AnalyticsRules } from './AnalyticsRules';
import type { TreeEntry, BlameRecord } from './AnalyticsTypes';
import { identity, languageFor } from './AnalyticsParsing';
import { readAnalyticsBlobs } from './AnalyticsBlobs';

export function emptyProject(oid: string): AnalyticsProject {
  return {
    oid,
    files: 0,
    textFiles: 0,
    binaryFiles: 0,
    lfsFiles: 0,
    symlinks: 0,
    submodules: 0,
    excludedFiles: 0,
    lines: 0,
    blamedLines: 0,
    unblamedFiles: 0,
    languages: [],
    ownership: [],
  };
}
async function readBlame(git: AnalyticsGit, rules: AnalyticsRules, entry: TreeEntry, revision: string): Promise<BlameRecord> {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let name = '';
  let email = '';
  const authors = new Map<string, AnalyticsIdentity & { lines: number }>();
  const consume = (line: string) => {
    if (line.startsWith('author ')) name = line.slice(7);
    if (line.startsWith('author-mail ')) email = line.slice(12).replace(/^<|>$/g, '');
    if (line.startsWith('\t')) {
      const author = identity(name, email, true);
      const row = authors.get(author.id) ?? { ...author, lines: 0 };
      row.lines++;
      authors.set(author.id, row);
    }
  };
  // An empty worktree prevents working-tree .mailmap rules from changing cached raw identities.
  // Mapping against the selected project tree is performed separately by AnalyticsRules.
  const gitDirectory = await git.directory();
  await git.stream(
    [
      `--git-dir=${gitDirectory}`,
      `--work-tree=${rules.rawWorktree}`,
      '-c',
      'core.bare=false',
      '-c',
      'mailmap.file=',
      '-c',
      'mailmap.blob=',
      '-c',
      'blame.ignoreRevsFile=',
      'blame',
      '--line-porcelain',
      revision,
      '--',
      entry.path,
    ],
    (chunk) => {
      pending += decoder.write(chunk);
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        consume(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    },
    undefined,
    rules.rawWorktree,
  );
  pending += decoder.end();
  if (pending) consume(pending);
  return { revision, path: entry.path, oid: entry.oid, authors: [...authors.values()] };
}
async function unchangedBlamePaths(git: AnalyticsGit, cache: AnalyticsCache, revision: string): Promise<{ previous: string; changed: Set<string> } | null> {
  const previous = cache.data.snapshot?.project.oid;
  if (!previous || previous === revision) return null;
  try {
    await git.text(['merge-base', '--is-ancestor', previous, revision]);
  } catch (error) {
    git.signal.throwIfAborted();
    if (!/failed \(1\)/.test(String(error))) throw error;
    return null;
  }
  const newHashes = (await git.text(['rev-list', revision, `^${previous}`])).trim().split(/\r?\n/).filter(Boolean);
  const records = newHashes.map((hash) => cache.data.commits.get(hash));
  if (records.some((record) => !record || record.parents.length > 1)) return null;
  return { previous, changed: new Set(records.flatMap((record) => record!.changes.flatMap((change) => [change.path, change.oldPath ?? change.path]))) };
}
export async function analyzeProject(
  git: AnalyticsGit,
  cache: AnalyticsCache,
  rules: AnalyticsRules,
  tree: TreeEntry[],
  revision: string,
  pathFilter: string,
  emit: (phase: AnalyticsProgress['phase'], done: number, total: number) => void,
  onProject?: (project: AnalyticsProject) => void,
): Promise<AnalyticsProject> {
  const project = emptyProject(revision);
  const included = tree.filter(
    (entry) => !rules.ignored(entry.path) && (!pathFilter || entry.path === pathFilter || entry.path.startsWith(pathFilter.replace(/\/$/, '') + '/')),
  );
  project.excludedFiles = tree.length - included.length;
  project.files = included.length;
  const missing = [...new Set(included.filter((entry) => entry.mode.startsWith('100')).map((entry) => entry.oid))].filter((oid) => !cache.data.blobs.has(oid));
  emit('project', 0, missing.length);
  await readAnalyticsBlobs(git, missing, cache, (done) => emit('project', done, missing.length));
  const text: TreeEntry[] = [];
  const languages = new Map<string, { language: string; files: number; lines: number }>();
  for (const entry of included) {
    if (entry.mode === '120000') {
      project.symlinks++;
      continue;
    }
    if (entry.mode === '160000') {
      project.submodules++;
      continue;
    }
    const blob = cache.data.blobs.get(entry.oid);
    if (blob?.kind === 'lfs') {
      project.lfsFiles++;
      continue;
    }
    if (!blob || blob.kind === 'binary') {
      project.binaryFiles++;
      continue;
    }
    project.textFiles++;
    project.lines += blob.lines;
    text.push(entry);
    const language = languageFor(entry.path);
    const row = languages.get(language) ?? { language, files: 0, lines: 0 };
    row.files++;
    row.lines += blob.lines;
    languages.set(language, row);
  }
  project.languages = [...languages.values()].sort((a, b) => b.lines - a.lines);
  onProject?.(project);
  const reusable = await unchangedBlamePaths(git, cache, revision);
  const ownership = new Map<string, AnalyticsIdentity & { lines: number }>();
  emit('blame', 0, text.length);
  for (let index = 0; index < text.length; index++) {
    git.signal.throwIfAborted();
    const entry = text[index];
    const key = `${revision}\0${entry.path}`;
    let record = cache.data.blame.get(key);
    if (!record && reusable && !reusable.changed.has(entry.path)) {
      const previous = cache.data.blame.get(`${reusable.previous}\0${entry.path}`);
      if (previous?.oid === entry.oid) {
        record = { ...previous, revision };
        cache.put('blame', record);
      }
    }
    if (!record) {
      try {
        record = await readBlame(git, rules, entry, revision);
        cache.put('blame', record);
      } catch (error) {
        git.signal.throwIfAborted();
        if (/abort/i.test(String(error))) throw error;
        project.unblamedFiles++;
        emit('blame', index + 1, text.length);
        continue;
      }
    }
    const lines = record.authors.reduce((sum, author) => sum + author.lines, 0);
    if (lines !== cache.data.blobs.get(entry.oid)?.lines) {
      project.unblamedFiles++;
      emit('blame', index + 1, text.length);
      continue;
    }
    await rules.mapAuthors(record.authors);
    project.blamedLines += lines;
    for (const raw of record.authors) {
      const author = rules.author(raw);
      const row = ownership.get(author.id) ?? { ...author, lines: 0 };
      row.lines += raw.lines;
      ownership.set(author.id, row);
    }
    emit('blame', index + 1, text.length);
  }
  project.ownership = [...ownership.values()].sort((a, b) => b.lines - a.lines);
  return project;
}
