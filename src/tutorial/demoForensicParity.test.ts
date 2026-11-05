import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoRepository } from './demoRepository';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { validDemoTreePath } from './demoDirectories';
import { demoBlobBytes } from './demoBlob';
import { demoForensicHistory } from './demoForensic';
import { demoRegexHistory } from './demoRegexHistory';
import { matchDemoRegex } from './demoRegexEngine';
import * as worker from './demoRegexWorker';
import { parseGitLog } from '@/utils/gitParsing';

type Language = 'de' | 'en';
type Case = { kind: 'string' | 'regex' | 'line'; path: string; query?: string; localized?: boolean; start?: number; end?: number };
type Fixture = { repo: DemoRepository; git: (args: string[], extra?: NodeJS.ProcessEnv) => string; sequence: Map<string, number> };
const available = spawnSync('git', ['--version'], { windowsHide: true, timeout: 5_000 }).status === 0;
const cases: Case[] = [
  { kind: 'string', path: 'README.md', query: '# OGC-Lernprojekt' },
  { kind: 'string', path: 'README.md', localized: true },
  { kind: 'string', path: 'src/app.ts', query: 'Hallo' },
  { kind: 'regex', path: 'src/app.ts', query: 'Hallo' },
  { kind: 'regex', path: 'src/app.ts', query: '"Hallo";$' },
  { kind: 'regex', path: 'src/app.ts', query: '"Hallo Welt!";$' },
  { kind: 'regex', path: 'src/app.ts', query: 'Hallo( Welt!)?' },
  { kind: 'regex', path: 'src/app.ts', query: '[Ww]elt' },
  { kind: 'regex', path: 'README.md', query: '^$' },
  { kind: 'regex', path: 'README.md', query: '^Status:' },
  { kind: 'regex', path: 'line-endings.txt', query: '^updated$' },
  { kind: 'regex', path: 'line-endings.txt', query: '^updated.$' },
  { kind: 'line', path: 'README.md', start: 1, end: 1 },
  { kind: 'line', path: 'README.md', start: 3, end: 3 },
  { kind: 'line', path: 'README.md', start: 1, end: 4 },
  { kind: 'line', path: 'src/app.ts', start: 1, end: 1 },
];
describe.skipIf(!available)('practice forensics against isolated native Git', () => {
  let root: string | undefined;
  const fixtures: Partial<Record<Language, Fixture>> = {};
  const safeFile = (directory: string, name: string) => {
    const target = resolve(directory, name);
    if (!validDemoTreePath(name) || !target.startsWith(resolve(directory) + sep)) throw new Error('Unexpected parity fixture path.');
    return target;
  };
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ogc-tutorial-forensic-parity-'));
    const templates = join(root, 'empty-templates'),
      config = join(root, 'empty-config');
    mkdirSync(templates);
    writeFileSync(config, '');
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) if (key.startsWith('GIT_')) delete environment[key];
    Object.assign(environment, { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
    for (const language of ['de', 'en'] as const) {
      const directory = join(root, language);
      mkdirSync(directory);
      const git = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
        execFileSync(
          'git',
          [
            '--no-pager',
            '-c',
            `core.hooksPath=${templates}`,
            '-c',
            `core.attributesFile=${config}`,
            '-c',
            `core.excludesFile=${config}`,
            '-c',
            'commit.gpgsign=false',
            '-c',
            'core.fsmonitor=false',
            '-c',
            'core.autocrlf=false',
            '-c',
            'gc.auto=0',
            '-c',
            'maintenance.auto=false',
            ...args,
          ],
          { cwd: directory, env: { ...environment, ...extra }, encoding: 'utf8', windowsHide: true },
        );
      git(['init', '--quiet', '--template=' + templates]);
      const repo = new DemoRepository();
      repo.reset(TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], language);
      const sequence = new Map<string, number>();
      for (const [index, commit] of [...repo.commits].reverse().entries())
        commit.files!['line-endings.txt'] = ['line\r\n', 'updated\r\n', 'updated', 'updated\r\nsecond\r\n'][index];
      repo.files = structuredClone(repo.commits[0].files!);
      repo.headFiles = structuredClone(repo.files);
      repo.indexFiles = structuredClone(repo.files);
      let previous: string[] = [];
      for (const [index, commit] of [...repo.commits].reverse().entries()) {
        const files = commit.files || {};
        for (const name of previous) if (!Object.prototype.hasOwnProperty.call(files, name)) rmSync(safeFile(directory, name), { force: true });
        for (const [name, blob] of Object.entries(files)) {
          const target = safeFile(directory, name);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, demoBlobBytes(blob));
        }
        git(['add', '-A', '--', '.']);
        git(['commit', '--quiet', '-m', String(index + 1)], {
          GIT_AUTHOR_NAME: commit.author || 'Practice',
          GIT_COMMITTER_NAME: commit.author || 'Practice',
          GIT_AUTHOR_EMAIL: commit.email || 'practice@example.invalid',
          GIT_COMMITTER_EMAIL: commit.email || 'practice@example.invalid',
          GIT_AUTHOR_DATE: commit.date,
          GIT_COMMITTER_DATE: commit.date,
        });
        previous = Object.keys(files);
        sequence.set(commit.hash, index + 1);
      }
      fixtures[language] = { repo, git, sequence };
    }
  });
  afterAll(() => {
    if (!root) return;
    const target = resolve(root);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('ogc-tutorial-forensic-parity-'))
      throw new Error('Unexpected parity cleanup path.');
    rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  beforeEach(() => {
    vi.spyOn(worker, 'runDemoRegex').mockImplementation(async (_owner, request) => matchDemoRegex(request));
  });
  afterEach(() => vi.restoreAllMocks());
  describe.each(['de', 'en'] as const)('%s history', (language) => {
    it.each(cases)('matches Git for $kind in $path: $query $start–$end', async (test) => {
      const { repo, git, sequence } = fixtures[language]!;
      const query = test.localized ? (language === 'de' ? 'Projektübersicht' : 'Project overview') : test.query || 'line-range';
      const args = [test.kind, test.path, query, String(test.start || 0), String(test.end || 0), '200'];
      const result = test.kind === 'regex' ? await demoRegexHistory(repo, args) : demoForensicHistory(repo, args);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error);
      const native = git([
        'log',
        '--no-ext-diff',
        '--no-textconv',
        '--format=probe:%s',
        ...(test.kind === 'line' ? [`-L${test.start},${test.end}:${test.path}`] : [test.kind === 'regex' ? '-G' : '-S', query, '--', test.path]),
      ]);
      const expected = native
        .split('\n')
        .filter((line) => line.startsWith('probe:'))
        .map((line) => Number(line.slice(6)));
      expect(parseGitLog(result.data).map((commit) => sequence.get(commit.hash))).toEqual(expected);
    });
  });
});
