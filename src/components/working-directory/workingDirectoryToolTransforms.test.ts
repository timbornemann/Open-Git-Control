import { describe, expect, it } from 'vitest';
import type { WorkingDirectoryEntryDto } from '@/shared/ipc/contracts/git';
import {
  changeExtensionMoves,
  commonEntryParent,
  gitignorePatterns,
  normalizeNameMoves,
  removeAffixMoves,
  selectedPathText,
  sortByFileTypeMoves,
} from './workingDirectoryToolTransforms';

const files = (...names: string[]): WorkingDirectoryEntryDto[] => names.map((name) => ({ path: name, name: name.split('/').pop() || name, kind: 'file' }));

describe('working-directory tool transforms', () => {
  it('changes file extensions and places removed suffixes before the extension', () => {
    expect(changeExtensionMoves(files('photos/first.jpeg', 'README'), '.jpg')).toEqual([
      { sourcePath: 'photos/first.jpeg', targetPath: 'photos/first.jpg' },
      { sourcePath: 'README', targetPath: 'README.jpg' },
    ]);
    expect(removeAffixMoves(files('photos/archive-first-old.jpeg'), 'archive-', '-old')).toEqual([
      { sourcePath: 'photos/archive-first-old.jpeg', targetPath: 'photos/first.jpeg' },
    ]);
  });

  it('normalizes whitespace, case, and German umlauts', () => {
    expect(normalizeNameMoves(files('Grüße Übersicht.TXT'), { lowercase: true, hyphenateSpaces: true, replaceUmlauts: true })).toEqual([
      { sourcePath: 'Grüße Übersicht.TXT', targetPath: 'gruesse-uebersicht.txt' },
    ]);
  });

  it('sorts known extensions into stable type folders and leaves already-sorted files in place', () => {
    expect(sortByFileTypeMoves(files('photo.jpeg', 'notes.pdf', 'bundle.zip', 'unknown.bin', 'images/kept.png'))).toEqual([
      { sourcePath: 'photo.jpeg', targetPath: 'images/photo.jpeg' },
      { sourcePath: 'notes.pdf', targetPath: 'documents/notes.pdf' },
      { sourcePath: 'bundle.zip', targetPath: 'archives/bundle.zip' },
      { sourcePath: 'unknown.bin', targetPath: 'other/unknown.bin' },
    ]);
  });

  it('builds exact and extension ignore rules plus relative and native absolute clipboard paths', () => {
    const entries: WorkingDirectoryEntryDto[] = [...files('logs/app.log', 'logs/error.log'), { path: 'cache', name: 'cache', kind: 'directory' }];
    expect(gitignorePatterns(entries, 'exact')).toEqual(['/logs/app.log', '/logs/error.log', '/cache/']);
    expect(gitignorePatterns(entries, 'extensions')).toEqual(['*.log']);
    expect(selectedPathText(entries.slice(0, 2), 'C:\\repos\\demo', false)).toBe('logs/app.log\nlogs/error.log');
    expect(selectedPathText(entries.slice(0, 2), 'C:\\repos\\demo', true)).toBe('C:\\repos\\demo\\logs\\app.log\nC:\\repos\\demo\\logs\\error.log');
  });

  it('uses the shared parent as the archive destination', () => {
    expect(commonEntryParent(files('assets/a.png', 'assets/icons/b.png'))).toBe('assets');
    expect(commonEntryParent(files('src/a.ts', 'docs/b.md'))).toBe('');
  });
});
