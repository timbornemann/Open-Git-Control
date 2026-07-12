import { describe, expect, it } from 'vitest';
import { applyLineEnding, detectLineEnding, normalizeToLf } from '@/utils/lineEndings';

describe('lineEndings', () => {
  it('detects the dominant line ending', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('\r\n');
    expect(detectLineEnding('a\nb\n')).toBe('\n');
    expect(detectLineEnding('a\rb')).toBe('\r');
    expect(detectLineEnding('single line')).toBe('\n');
    expect(detectLineEnding('')).toBe('\n');
  });

  it('normalizes CRLF and lone CR to LF', () => {
    expect(normalizeToLf('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('round-trips a CRLF file through normalize + apply unchanged', () => {
    const original = "import React from 'react';\r\nimport App from './App';\r\n";
    const ending = detectLineEnding(original);
    const restored = applyLineEnding(normalizeToLf(original), ending);
    expect(restored).toBe(original);
  });

  it('leaves LF files untouched on apply', () => {
    expect(applyLineEnding('a\nb', '\n')).toBe('a\nb');
  });
});
