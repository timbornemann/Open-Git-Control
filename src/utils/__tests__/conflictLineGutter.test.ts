import { describe, expect, it } from 'vitest';
import {
  getConflictLineGutterKinds,
  normalizeMergeConflictFileContent,
  splitContentLines,
} from '../conflictLineGutter';

describe('getConflictLineGutterKinds', () => {
  it('returns neutral lines when no conflict markers are present', () => {
    expect(getConflictLineGutterKinds(['a', 'b', 'c'])).toEqual(['neutral', 'neutral', 'neutral']);
  });

  it('classifies a valid conflict block into marker/ours/theirs sections', () => {
    const lines = [
      'before',
      '<<<<<<< HEAD   ',
      'ours 1',
      'ours 2',
      '   =======',
      'theirs 1',
      '>>>>>>> branch-name',
      'after',
    ];

    expect(getConflictLineGutterKinds(lines)).toEqual([
      'neutral',
      'marker',
      'ours',
      'ours',
      'marker',
      'theirs',
      'marker',
      'neutral',
    ]);
  });

  it('marks malformed starts without separator as marker and continues at nested start', () => {
    const lines = [
      '<<<<<<< HEAD',
      'ours line',
      '<<<<<<< nested',
      'nested ours',
      '=======',
      'nested theirs',
      '>>>>>>> nested',
    ];

    expect(getConflictLineGutterKinds(lines)).toEqual([
      'marker',
      'neutral',
      'marker',
      'ours',
      'marker',
      'theirs',
      'marker',
    ]);
  });

  it('marks malformed blocks with separator but missing end marker', () => {
    const lines = [
      '<<<<<<< HEAD',
      'ours line',
      '=======',
      'theirs line',
      '<<<<<<< nested',
      'nested ours',
      '=======',
      'nested theirs',
      '>>>>>>> nested',
    ];

    expect(getConflictLineGutterKinds(lines)).toEqual([
      'marker',
      'neutral',
      'marker',
      'neutral',
      'marker',
      'ours',
      'marker',
      'theirs',
      'marker',
    ]);
  });
});

describe('normalizeMergeConflictFileContent', () => {
  it('normalizes line endings and collapses repeated trailing empty lines', () => {
    const raw = 'a\r\nb\r\n\r\n\r\n';
    expect(normalizeMergeConflictFileContent(raw)).toBe('a\nb\n');
  });

  it('keeps at most one trailing empty line segment', () => {
    const raw = 'single\n';
    expect(normalizeMergeConflictFileContent(raw)).toBe('single\n');
  });
});

describe('splitContentLines', () => {
  it('returns one empty line for empty content', () => {
    expect(splitContentLines('')).toEqual(['']);
  });

  it('splits content using normalized LF newlines', () => {
    expect(splitContentLines('x\r\ny\rz')).toEqual(['x', 'y', 'z']);
  });
});
