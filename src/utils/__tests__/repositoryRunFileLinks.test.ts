import { describe, expect, it } from 'vitest';
import { findRepositoryRunFileReferences, resolveRepositoryRunFile } from '../repositoryRunFileLinks';

const repo = 'D:/Projects/Example app';
const targets = (text: string, root = repo) => findRepositoryRunFileReferences(text, root).map((reference) => reference.target);

describe('run output file references', () => {
  it.each([
    ['src/App.tsx:17:8: error TS2322: invalid type', { path: 'src/App.tsx', line: 17, column: 8 }],
    ['src/my component.tsx(12,4): error TS1000', { path: 'src/my component.tsx', line: 12, column: 4 }],
    ['  --> crates/app/src/main.rs:25:6', { path: 'crates/app/src/main.rs', line: 25, column: 6 }],
    ['at render (D:\\Projects\\Example app\\src\\App.tsx:9:2)', { path: 'src/App.tsx', line: 9, column: 2 }],
    ['at start (file:///D:/Projects/Example%20app/src/caf%C3%A9.ts:15:3)', { path: 'src/café.ts', line: 15, column: 3 }],
    ['File "src/my script.py", line 41, in main', { path: 'src/my script.py', line: 41 }],
    ['[error] "./src/settings.json:6:10": Invalid JSON', { path: 'src/settings.json', line: 6, column: 10 }],
    ['Config: .env', { path: '.env' }],
  ])('recognizes %s', (text, target) => {
    expect(targets(text)).toEqual([target]);
    const references = findRepositoryRunFileReferences(text, repo);
    for (const reference of references) expect(text.slice(reference.start, reference.end)).toBe(reference.text);
  });

  it('links every reference without modifying spaces, punctuation or the source text', () => {
    const text = 'Compare src/a.ts:2 with ./src/b.ts:9:1 and "src/my file.json".';
    expect(targets(text)).toEqual([{ path: 'src/a.ts', line: 2 }, { path: 'src/b.ts', line: 9, column: 1 }, { path: 'src/my file.json' }]);
  });

  it('preserves POSIX case and supports absolute paths, UNC paths and encoded project names', () => {
    expect(targets('at main (/home/Tim/repo/src/Main.ts:8:3)', '/home/Tim/repo')).toEqual([{ path: 'src/Main.ts', line: 8, column: 3 }]);
    expect(resolveRepositoryRunFile('/home/Tim/repo', '/home/tim/repo/a.ts')).toBeNull();
    expect(resolveRepositoryRunFile('//server/share/repo', 'file://server/share/repo/src/main.rs', { line: 4 })).toEqual({ path: 'src/main.rs', line: 4 });
    expect(targets('at main (file:///D:/Projects/A%5E3/main.ts:7:1)', 'D:/Projects/A^3')).toEqual([{ path: 'main.ts', line: 7, column: 1 }]);
    expect(resolveRepositoryRunFile(repo, 'd:\\projects\\example APP\\src\\main.ts')).toEqual({ path: 'src/main.ts' });
  });

  it('does not link external URLs, runtime frames, other repositories or escaped paths', () => {
    expect(targets('Unsupported engine: wanted: {"node":"24.14.0"} (current: {"node":"v25.6.1","pnpm":"11.9.0"})')).toEqual([]);
    expect(targets('at process.processTicksAndRejections (node:internal/process/task_queues:104:5)')).toEqual([]);
    expect(targets('https://example.com/src/a.ts:1:3 node:internal/process/task_queues:104:5')).toEqual([]);
    expect(targets('C:\\Other\\src\\a.ts:7:2 D:\\Projects\\Example app-other\\a.ts:9:2')).toEqual([]);
    expect(resolveRepositoryRunFile(repo, '../other/file.ts')).toBeNull();
    expect(resolveRepositoryRunFile(repo, 'src/../../../file.ts')).toBeNull();
    expect(resolveRepositoryRunFile(repo, 'javascript:alert(1)')).toBeNull();
    expect(resolveRepositoryRunFile(repo, 'file:///D:/Projects/Example%20app/src/%2e%2e/%2e%2e/other.ts')).toBeNull();
    expect(resolveRepositoryRunFile(repo, 'D:relative.ts')).toBeNull();
    expect(resolveRepositoryRunFile(repo, 'src/*.ts')).toBeNull();
  });
});
